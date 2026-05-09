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

# Colunas retornadas em todos os SELECTs / RETURNING.
_COLS = """
    id, tree_id, person_id, union_id,
    type, custom_label,
    year, month, day, place, description,
    created_at
"""


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
    where: list[str] = ["tree_id = %s"]
    params: list[Any] = [tree_id]

    if from_year is not None:
        where.append("year >= %s")
        params.append(from_year)
    if to_year is not None:
        where.append("year <= %s")
        params.append(to_year)
    if event_type is not None:
        where.append("type = %s::event_type_t")
        params.append(event_type)
    if person_id is not None:
        where.append("person_id = %s")
        params.append(person_id)
    if union_id is not None:
        where.append("union_id = %s")
        params.append(union_id)

    sql = (
        f"SELECT {_COLS} FROM events"
        f" WHERE {' AND '.join(where)}"
        f" ORDER BY year ASC NULLS LAST, id ASC"
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
            RETURNING {_COLS}
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

    return EventOut.model_validate(row)


def get_event(conn: Connection, event_id: uuid.UUID) -> EventOut:
    """Retorna detalhe de um evento; 404 se não existir ou RLS bloquear."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            f"SELECT {_COLS} FROM events WHERE id = %s",
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

    # Whitelist de campos editáveis — nunca interpole input externo no SQL.
    allowed = {
        "type", "custom_label",
        "year", "month", "day", "place", "description",
    }
    valid_fields = {k: v for k, v in fields.items() if k in allowed}

    if not valid_fields:
        return get_event(conn, event_id)

    # Campo que precisa de cast de enum no banco.
    _enum_casts = {"type": "::event_type_t"}

    # Safe: keys vêm da whitelist `allowed` acima.
    set_clauses = [
        f"{k} = %s{_enum_casts.get(k, '')}" for k in valid_fields
    ]
    sql = (
        f"UPDATE events SET {', '.join(set_clauses)} "
        f"WHERE id = %s "
        f"RETURNING {_COLS}"
    )
    params = [*valid_fields.values(), event_id]

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        row = cur.fetchone()

    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")

    return EventOut.model_validate(row)


def delete_event(conn: Connection, event_id: uuid.UUID) -> None:
    """Remove um evento."""
    with conn.cursor() as cur:
        cur.execute("DELETE FROM events WHERE id = %s", (event_id,))
        if cur.rowcount == 0:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
