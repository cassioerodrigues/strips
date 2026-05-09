"""parents.py — serviços de banco para vínculos de filiação (person_parents).

Usa SQL bruto via psycopg com dict_row.
RLS é aplicado automaticamente via get_db_authenticated.
"""
from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from psycopg import Connection
from psycopg.rows import dict_row

from app.schemas.relations import ParentLinkCreate, ParentLinkOut


def add_parent(
    conn: Connection,
    child_id: uuid.UUID,
    payload: ParentLinkCreate,
) -> ParentLinkOut:
    """Adiciona vínculo de filiação; RLS garante que apenas editor/owner pode escrever."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            INSERT INTO person_parents(child_id, parent_id, kind, notes)
            VALUES (%s, %s, %s::parent_kind_t, %s)
            ON CONFLICT (child_id, parent_id) DO UPDATE
                SET kind  = EXCLUDED.kind,
                    notes = EXCLUDED.notes
            RETURNING child_id, parent_id, kind, notes
            """,
            (child_id, payload.parent_id, payload.kind, payload.notes),
        )
        row = cur.fetchone()
        if row is None:  # pragma: no cover
            raise RuntimeError("INSERT INTO person_parents RETURNING returned no row")
    return ParentLinkOut.model_validate(row)


def remove_parent(
    conn: Connection,
    child_id: uuid.UUID,
    parent_id: uuid.UUID,
) -> None:
    """Remove vínculo de filiação; 404 se não existir ou RLS bloquear."""
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM person_parents WHERE child_id = %s AND parent_id = %s",
            (child_id, parent_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Parent link not found")
