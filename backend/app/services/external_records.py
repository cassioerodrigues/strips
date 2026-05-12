"""external_records.py — serviços de banco para registros externos.

Usa SQL bruto via psycopg com dict_row.
A conexão já está numa transação com SET LOCAL configurado pelo
get_db_authenticated de deps.py — RLS é aplicado automaticamente.

PATCH com `status` no body atualiza automaticamente `reviewed_at` (now())
e `reviewed_by` (auth.uid()). Sem `status` no body, esses campos ficam
intocados.
"""
from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import HTTPException, status
from psycopg import Connection
from psycopg.rows import dict_row

from app.schemas.external_record import (
    ExternalRecordCreate,
    ExternalRecordOut,
    ExternalRecordUpdate,
    RecordStatus,
)

# Colunas retornadas em todos os SELECTs / RETURNING.
_COLS = """
    id, tree_id, person_id,
    source, source_id, source_url,
    title, subtitle,
    confidence, status, payload,
    created_at, reviewed_at, reviewed_by
"""


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


def list_external_records(
    conn: Connection,
    tree_id: uuid.UUID,
    status_filter: RecordStatus | None,
    person_id: uuid.UUID | None,
    source: str | None,
    limit: int,
    offset: int,
) -> list[ExternalRecordOut]:
    """Lista registros externos de uma árvore, ordenados por confiança desc.

    `status_filter=None` significa "todos os status".
    """
    where: list[str] = ["tree_id = %s"]
    params: list[Any] = [tree_id]

    if status_filter is not None:
        where.append("status = %s::record_status_t")
        params.append(status_filter)
    if person_id is not None:
        where.append("person_id = %s")
        params.append(person_id)
    if source is not None:
        where.append("source = %s")
        params.append(source)

    sql = (
        f"SELECT {_COLS} "
        f"FROM external_records "
        f"WHERE {' AND '.join(where)} "
        f"ORDER BY confidence DESC NULLS LAST, created_at DESC "
        f"LIMIT %s OFFSET %s"
    )
    params.extend([limit, offset])

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        return [ExternalRecordOut.model_validate(r) for r in cur.fetchall()]


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


def create_external_record(
    conn: Connection,
    tree_id: uuid.UUID,
    payload: ExternalRecordCreate,
) -> ExternalRecordOut:
    """Cria uma sugestão manual de registro externo (editor/owner via RLS)."""
    payload_json = json.dumps(payload.payload) if payload.payload is not None else None

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            f"""
            INSERT INTO external_records(
                tree_id, person_id,
                source, source_id, source_url,
                title, subtitle,
                confidence, status, payload
            ) VALUES (
                %s, %s,
                %s, %s, %s,
                %s, %s,
                %s, %s::record_status_t, %s::jsonb
            )
            RETURNING {_COLS}
            """,
            (
                tree_id, payload.person_id,
                payload.source, payload.source_id, payload.source_url,
                payload.title, payload.subtitle,
                payload.confidence, payload.status, payload_json,
            ),
        )
        row = cur.fetchone()
        if row is None:  # pragma: no cover
            raise RuntimeError("INSERT INTO external_records RETURNING returned no row")

    return ExternalRecordOut.model_validate(row)


# ---------------------------------------------------------------------------
# Get (helper interno — não exposto no router)
# ---------------------------------------------------------------------------


def _get_external_record(conn: Connection, record_id: uuid.UUID) -> ExternalRecordOut:
    """Retorna detalhe de um registro; 404 se não existir ou RLS bloquear."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            f"SELECT {_COLS} FROM external_records WHERE id = %s",
            (record_id,),
        )
        row = cur.fetchone()

    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "External record not found")

    return ExternalRecordOut.model_validate(row)


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


def update_external_record(
    conn: Connection,
    record_id: uuid.UUID,
    user_sub: uuid.UUID,
    payload: ExternalRecordUpdate,
) -> ExternalRecordOut:
    """Atualiza `status` e/ou `person_id`.

    Quando `status` está presente no body (exclude_unset), preenche
    `reviewed_at = now()` e `reviewed_by = user_sub` — o spec define
    "automaticamente quando status muda".
    """
    fields = payload.model_dump(exclude_unset=True)

    # Whitelist explícita — apenas estes dois campos são mutáveis pelo spec.
    allowed = {"status", "person_id"}
    valid_fields = {k: v for k, v in fields.items() if k in allowed}

    # `status: null` explícito é tratado como "não mexer" — o enum não pode
    # ser nulo na semântica do produto e o spec fala em "automaticamente
    # quando status muda", então ignoramos a tentativa de zerar.
    if valid_fields.get("status", "sentinel") is None:
        valid_fields.pop("status")

    if not valid_fields:
        return _get_external_record(conn, record_id)

    # Campos que precisam de cast de enum.
    _enum_casts = {"status": "::record_status_t"}

    # Safe: keys vêm da whitelist `allowed` acima.
    set_clauses = [f"{k} = %s{_enum_casts.get(k, '')}" for k in valid_fields]
    params: list[Any] = list(valid_fields.values())

    # Se `status` foi enviado com valor não-nulo, atualizar reviewed_at/reviewed_by.
    if "status" in valid_fields:
        set_clauses.append("reviewed_at = now()")
        set_clauses.append("reviewed_by = %s")
        params.append(user_sub)

    params.append(record_id)
    sql = (
        f"UPDATE external_records SET {', '.join(set_clauses)} "
        f"WHERE id = %s "
        f"RETURNING {_COLS}"
    )

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        row = cur.fetchone()

    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "External record not found")

    return ExternalRecordOut.model_validate(row)


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


def delete_external_record(conn: Connection, record_id: uuid.UUID) -> None:
    """Remove um registro externo (editor/owner via RLS)."""
    with conn.cursor() as cur:
        cur.execute("DELETE FROM external_records WHERE id = %s", (record_id,))
        if cur.rowcount == 0:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "External record not found")
