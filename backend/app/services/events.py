"""events.py — serviços de banco para eventos GEDCOM (tabela `events`).

Usa SQL bruto via psycopg com dict_row.
A conexão já está numa transação com SET LOCAL configurado pelo
get_db_authenticated de deps.py — RLS é aplicado automaticamente.

Filtros de lista são construídos dinamicamente com listas de condições e
parâmetros — nunca interpolando strings do cliente no SQL.
"""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import HTTPException, status
from psycopg import Connection
from psycopg.rows import dict_row

from app.schemas.event import EventCreate, EventOut, EventType, EventUpdate

# Colunas retornadas em todos os SELECTs.
_COLS = """
    e.id, e.tree_id, e.person_id, e.union_id,
    e.type, e.custom_label,
    e.year, e.month, e.day, e.place, e.description,
    e.created_at,
    COALESCE(
        array_agg(ep.person_id ORDER BY ep.person_id)
            FILTER (WHERE ep.person_id IS NOT NULL),
        ARRAY[]::uuid[]
    ) AS related_person_ids
"""


def _normalize_related_person_ids(
    related_person_ids: list[uuid.UUID] | None,
    primary_person_id: uuid.UUID | None,
) -> list[uuid.UUID]:
    """Deduplica ids relacionados e evita duplicar a pessoa primaria."""
    normalized: list[uuid.UUID] = []
    for pid in related_person_ids or []:
        if pid == primary_person_id or pid in normalized:
            continue
        normalized.append(pid)
    return normalized


def _validate_related_people(
    cur,
    tree_id: uuid.UUID,
    related_person_ids: list[uuid.UUID],
) -> None:
    if not related_person_ids:
        return
    cur.execute(
        """
        SELECT count(*) AS count
        FROM persons
        WHERE tree_id = %s AND id = ANY(%s::uuid[])
        """,
        (tree_id, related_person_ids),
    )
    row = cur.fetchone()
    if row is None or row["count"] != len(related_person_ids):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Related people must belong to the same tree as the event.",
        )


def _replace_related_people(
    cur,
    event_id: uuid.UUID,
    related_person_ids: list[uuid.UUID],
) -> None:
    cur.execute("DELETE FROM event_people WHERE event_id = %s", (event_id,))
    if not related_person_ids:
        return
    cur.executemany(
        """
        INSERT INTO event_people(event_id, person_id)
        VALUES (%s, %s)
        """,
        [(event_id, pid) for pid in related_person_ids],
    )


def list_events(
    conn: Connection,
    tree_id: uuid.UUID,
    from_year: int | None,
    to_year: int | None,
    event_type: EventType | None,
    person_id: uuid.UUID | None,
    union_id: uuid.UUID | None,
) -> list[EventOut]:
    """Lista eventos de uma árvore com filtros opcionais, ordenados por year ASC."""
    where: list[str] = ["e.tree_id = %s"]
    params: list[Any] = [tree_id]

    if from_year is not None:
        where.append("e.year >= %s")
        params.append(from_year)
    if to_year is not None:
        where.append("e.year <= %s")
        params.append(to_year)
    if event_type is not None:
        # Cast explícito: psycopg3 não converte str → event_type_t automaticamente.
        where.append("e.type = %s::event_type_t")
        params.append(event_type)
    if person_id is not None:
        where.append(
            "(e.person_id = %s OR EXISTS ("
            "SELECT 1 FROM event_people ep_filter "
            "WHERE ep_filter.event_id = e.id AND ep_filter.person_id = %s"
            "))"
        )
        params.append(person_id)
        params.append(person_id)
    if union_id is not None:
        where.append("e.union_id = %s")
        params.append(union_id)

    sql = (
        f"SELECT {_COLS} FROM events e"
        f" LEFT JOIN event_people ep ON ep.event_id = e.id"
        f" WHERE {' AND '.join(where)}"
        f" GROUP BY e.id"
        f" ORDER BY e.year ASC NULLS LAST, e.id ASC"
    )

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        return [EventOut.model_validate(r) for r in cur.fetchall()]


def create_event(
    conn: Connection,
    tree_id: uuid.UUID,
    payload: EventCreate,
) -> EventOut:
    """Cria um novo evento.

    A validação XOR person_id/union_id já foi executada pelo model_validator
    de EventCreate (Pydantic → 422 antes de chegar aqui).
    """
    with conn.cursor(row_factory=dict_row) as cur:
        related_person_ids = _normalize_related_person_ids(
            payload.related_person_ids,
            payload.person_id,
        )
        _validate_related_people(cur, tree_id, related_person_ids)
        cur.execute(
            f"""
            INSERT INTO events(
                tree_id, person_id, union_id,
                type, custom_label,
                year, month, day, place, description
            ) VALUES (
                %s, %s, %s,
                %s::event_type_t, %s,
                %s, %s, %s, %s, %s
            )
            RETURNING id
            """,
            (
                tree_id,
                payload.person_id,
                payload.union_id,
                payload.type,
                payload.custom_label,
                payload.year,
                payload.month,
                payload.day,
                payload.place,
                payload.description,
            ),
        )
        row = cur.fetchone()
        if row is None:  # pragma: no cover
            raise RuntimeError("INSERT INTO events RETURNING returned no row")
        event_id = row["id"]
        _replace_related_people(cur, event_id, related_person_ids)

    return get_event(conn, event_id)


def get_event(conn: Connection, event_id: uuid.UUID) -> EventOut:
    """Retorna detalhe de um evento; 404 se não existir ou RLS bloquear."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            f"""
            SELECT {_COLS}
            FROM events e
            LEFT JOIN event_people ep ON ep.event_id = e.id
            WHERE e.id = %s
            GROUP BY e.id
            """,
            (event_id,),
        )
        row = cur.fetchone()

    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")

    return EventOut.model_validate(row)


def update_event(
    conn: Connection,
    event_id: uuid.UUID,
    payload: EventUpdate,
) -> EventOut:
    """Atualiza somente os campos enviados (PATCH parcial)."""
    fields = payload.model_dump(exclude_unset=True)
    related_sent = "related_person_ids" in fields

    # Whitelist de campos editáveis — nunca interpole input externo no SQL.
    allowed = {
        "type", "custom_label",
        "year", "month", "day", "place", "description",
    }
    valid_fields = {k: v for k, v in fields.items() if k in allowed}

    if not valid_fields and not related_sent:
        return get_event(conn, event_id)

    with conn.cursor(row_factory=dict_row) as cur:
        if valid_fields:
            # Campo que precisa de cast de enum no banco.
            _enum_casts = {"type": "::event_type_t"}

            # Safe: keys vêm da whitelist `allowed` acima.
            set_clauses = [
                f"{k} = %s{_enum_casts.get(k, '')}" for k in valid_fields
            ]
            sql = (
                f"UPDATE events e SET {', '.join(set_clauses)} "
                f"WHERE e.id = %s "
                f"RETURNING e.id, e.tree_id, e.person_id"
            )
            params = [*valid_fields.values(), event_id]
            cur.execute(sql, params)
            row = cur.fetchone()
        else:
            cur.execute(
                "SELECT id, tree_id, person_id FROM events WHERE id = %s",
                (event_id,),
            )
            row = cur.fetchone()

    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")

    if related_sent:
        related_person_ids = _normalize_related_person_ids(
            payload.related_person_ids,
            row["person_id"],
        )
        with conn.cursor(row_factory=dict_row) as cur:
            _validate_related_people(cur, row["tree_id"], related_person_ids)
            _replace_related_people(cur, event_id, related_person_ids)

    return get_event(conn, event_id)


def delete_event(conn: Connection, event_id: uuid.UUID) -> None:
    """Remove um evento."""
    with conn.cursor() as cur:
        cur.execute("DELETE FROM events WHERE id = %s", (event_id,))
        if cur.rowcount == 0:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
