"""unions.py — serviços de banco para uniões/casamentos (tabela `unions`).

Usa SQL bruto via psycopg com dict_row.
A conexão já está numa transação com SET LOCAL configurado pelo
get_db_authenticated de deps.py — RLS é aplicado automaticamente.

Invariante: partner_a_id < partner_b_id (garantida por ensure_uuid_order antes do INSERT).
"""
from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from psycopg import Connection
from psycopg.rows import dict_row

from app.schemas.union import UnionCreate, UnionOut, UnionUpdate
from app.services.helpers import ensure_uuid_order

# Colunas retornadas em todos os SELECTs / RETURNING.
_COLS = """
    id, tree_id,
    partner_a_id, partner_b_id,
    type, status,
    start_year, start_month, start_day, start_place,
    end_year, end_month, end_day, end_place, end_reason,
    notes, created_at, updated_at
"""


def list_unions(conn: Connection, tree_id: uuid.UUID) -> list[UnionOut]:
    """Lista todas as uniões de uma árvore, ordenadas por start_year."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            f"""
            SELECT {_COLS}
            FROM unions
            WHERE tree_id = %s
            ORDER BY start_year ASC NULLS LAST, id ASC
            """,
            (tree_id,),
        )
        return [UnionOut.model_validate(r) for r in cur.fetchall()]


def create_union(
    conn: Connection,
    tree_id: uuid.UUID,
    payload: UnionCreate,
) -> UnionOut:
    """Cria uma nova união aplicando ensure_uuid_order antes do INSERT.

    O swap de partner_a/partner_b é transparente: o cliente pode enviar os
    parceiros em qualquer ordem; o serviço normaliza antes de gravar.
    """
    a, b = ensure_uuid_order(payload.partner_a_id, payload.partner_b_id)

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            f"""
            INSERT INTO unions(
                tree_id,
                partner_a_id, partner_b_id,
                type, status,
                start_year, start_month, start_day, start_place,
                end_year, end_month, end_day, end_place, end_reason,
                notes
            ) VALUES (
                %s,
                %s, %s,
                %s::union_type_t, %s::union_status_t,
                %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s
            )
            RETURNING {_COLS}
            """,
            (
                tree_id,
                a, b,
                payload.type, payload.status,
                payload.start_year, payload.start_month, payload.start_day, payload.start_place,
                payload.end_year, payload.end_month, payload.end_day, payload.end_place, payload.end_reason,
                payload.notes,
            ),
        )
        row = cur.fetchone()
        if row is None:  # pragma: no cover
            raise RuntimeError("INSERT INTO unions RETURNING returned no row")

    return UnionOut.model_validate(row)


def get_union(conn: Connection, union_id: uuid.UUID) -> UnionOut:
    """Retorna detalhe de uma união; 404 se não existir ou RLS bloquear."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            f"SELECT {_COLS} FROM unions WHERE id = %s",
            (union_id,),
        )
        row = cur.fetchone()

    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Union not found")

    return UnionOut.model_validate(row)


def update_union(
    conn: Connection,
    union_id: uuid.UUID,
    payload: UnionUpdate,
) -> UnionOut:
    """Atualiza somente os campos enviados (PATCH parcial)."""
    fields = payload.model_dump(exclude_unset=True)

    # Whitelist de campos editáveis — nunca interpole input externo no SQL.
    allowed = {
        "type", "status",
        "start_year", "start_month", "start_day", "start_place",
        "end_year", "end_month", "end_day", "end_place", "end_reason",
        "notes",
    }
    valid_fields = {k: v for k, v in fields.items() if k in allowed}

    if not valid_fields:
        return get_union(conn, union_id)

    # Campos que precisam de cast de enum no banco.
    _enum_casts = {"type": "::union_type_t", "status": "::union_status_t"}

    # Safe: keys vêm da whitelist `allowed` acima.
    set_clauses = [
        f"{k} = %s{_enum_casts.get(k, '')}" for k in valid_fields
    ]
    sql = (
        f"UPDATE unions SET {', '.join(set_clauses)}, updated_at = now() "
        f"WHERE id = %s "
        f"RETURNING {_COLS}"
    )
    params = [*valid_fields.values(), union_id]

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        row = cur.fetchone()

    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Union not found")

    return UnionOut.model_validate(row)


def delete_union(conn: Connection, union_id: uuid.UUID) -> None:
    """Remove uma união; cascade em events é automático."""
    with conn.cursor() as cur:
        cur.execute("DELETE FROM unions WHERE id = %s", (union_id,))
        if cur.rowcount == 0:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Union not found")
