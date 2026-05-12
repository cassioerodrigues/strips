"""external_records.py — router de registros externos / sugestões.

Endpoints:
  GET    /api/trees/{tree_id}/external-records
  POST   /api/trees/{tree_id}/external-records
  PATCH  /api/external-records/{record_id}
  DELETE /api/external-records/{record_id}

RLS já filtra: viewers/editors/owners enxergam tudo da árvore via
external_records_select; somente editor/owner faz write
(external_records_write). Viewer recebendo INSERT/UPDATE/DELETE bate em
InsufficientPrivilege → 403 (via app/errors.py).
"""
from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query, status
from psycopg import Connection

from app.auth import Claims
from app.deps import get_current_user, get_db_authenticated
from app.schemas.external_record import (
    ExternalRecordCreate,
    ExternalRecordOut,
    ExternalRecordUpdate,
)
from app.services.external_records import (
    create_external_record,
    delete_external_record,
    list_external_records,
    update_external_record,
)

router = APIRouter(tags=["external_records"])

# Whitelist do filtro de status: os três valores do enum + 'all' (sem filtro).
StatusFilter = Literal["suggested", "accepted", "rejected", "all"]


# ---------------------------------------------------------------------------
# Collection endpoints — /api/trees/{tree_id}/external-records
# ---------------------------------------------------------------------------


@router.get(
    "/api/trees/{tree_id}/external-records",
    response_model=list[ExternalRecordOut],
)
def list_external_records_endpoint(
    tree_id: uuid.UUID,
    status_filter: StatusFilter = Query(
        default="suggested",
        alias="status",
        description="Filtrar por status; 'all' retorna todos.",
    ),
    person_id: uuid.UUID | None = Query(default=None, description="Filtrar por pessoa vinculada"),
    source: str | None = Query(default=None, description="Filtrar pela fonte ('familysearch', etc.)"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    conn: Connection = Depends(get_db_authenticated),
) -> list[ExternalRecordOut]:
    """Lista registros externos da árvore, ordenados por confidence DESC, created_at DESC."""
    # 'all' → sem filtro de status no SQL.
    actual_status = None if status_filter == "all" else status_filter
    return list_external_records(
        conn, tree_id, actual_status, person_id, source, limit, offset
    )


@router.post(
    "/api/trees/{tree_id}/external-records",
    response_model=ExternalRecordOut,
    status_code=status.HTTP_201_CREATED,
)
def create_external_record_endpoint(
    tree_id: uuid.UUID,
    payload: ExternalRecordCreate,
    conn: Connection = Depends(get_db_authenticated),
) -> ExternalRecordOut:
    """Cria sugestão manual de registro externo (editor/owner via RLS)."""
    return create_external_record(conn, tree_id, payload)


# ---------------------------------------------------------------------------
# Detail endpoints — /api/external-records/{id}
# ---------------------------------------------------------------------------


@router.patch(
    "/api/external-records/{record_id}",
    response_model=ExternalRecordOut,
)
def update_external_record_endpoint(
    record_id: uuid.UUID,
    payload: ExternalRecordUpdate,
    user: Claims = Depends(get_current_user),
    conn: Connection = Depends(get_db_authenticated),
) -> ExternalRecordOut:
    """Atualiza `status` e/ou `person_id` de uma sugestão.

    Se o body inclui `status`, o serviço preenche automaticamente
    `reviewed_at = now()` e `reviewed_by = user.sub`.
    """
    return update_external_record(conn, record_id, user.sub, payload)


@router.delete(
    "/api/external-records/{record_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_external_record_endpoint(
    record_id: uuid.UUID,
    conn: Connection = Depends(get_db_authenticated),
) -> None:
    """Remove um registro externo (editor/owner via RLS)."""
    delete_external_record(conn, record_id)
