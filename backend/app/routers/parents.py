"""parents.py — router de vínculos de filiação (/api/people/{child_id}/parents)."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from psycopg import Connection

from app.deps import get_db_authenticated
from app.schemas.relations import ParentLinkCreate, ParentLinkOut
from app.services.parents import add_parent, remove_parent

router = APIRouter(tags=["parents"])


@router.post(
    "/api/people/{child_id}/parents",
    response_model=ParentLinkOut,
    status_code=status.HTTP_201_CREATED,
)
def add_parent_endpoint(
    child_id: uuid.UUID,
    payload: ParentLinkCreate,
    conn: Connection = Depends(get_db_authenticated),
) -> ParentLinkOut:
    """Adiciona vínculo de filiação. Editor/owner via RLS."""
    return add_parent(conn, child_id, payload)


@router.delete(
    "/api/people/{child_id}/parents/{parent_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_parent_endpoint(
    child_id: uuid.UUID,
    parent_id: uuid.UUID,
    conn: Connection = Depends(get_db_authenticated),
) -> None:
    """Remove vínculo de filiação. Editor/owner via RLS."""
    remove_parent(conn, child_id, parent_id)
