"""unions.py — router de uniões/casamentos (/api/trees/{tree_id}/unions e /api/unions/{id})."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from psycopg import Connection

from app.deps import get_db_authenticated
from app.schemas.union import UnionCreate, UnionOut, UnionUpdate
from app.services.unions import create_union, delete_union, list_unions, update_union

router = APIRouter(tags=["unions"])


# ---------------------------------------------------------------------------
# Collection endpoints — /api/trees/{tree_id}/unions
# ---------------------------------------------------------------------------


@router.get("/api/trees/{tree_id}/unions", response_model=list[UnionOut])
def list_unions_endpoint(
    tree_id: uuid.UUID,
    conn: Connection = Depends(get_db_authenticated),
) -> list[UnionOut]:
    """Lista todas as uniões de uma árvore, ordenadas por start_year."""
    return list_unions(conn, tree_id)


@router.post(
    "/api/trees/{tree_id}/unions",
    response_model=UnionOut,
    status_code=status.HTTP_201_CREATED,
)
def create_union_endpoint(
    tree_id: uuid.UUID,
    payload: UnionCreate,
    conn: Connection = Depends(get_db_authenticated),
) -> UnionOut:
    """Cria uma nova união na árvore.

    Aplica ensure_uuid_order automaticamente: partner_a_id e partner_b_id
    podem ser enviados em qualquer ordem — o serviço normaliza antes do INSERT.
    """
    return create_union(conn, tree_id, payload)


# ---------------------------------------------------------------------------
# Detail endpoints — /api/unions/{id}
# ---------------------------------------------------------------------------


@router.patch("/api/unions/{union_id}", response_model=UnionOut)
def update_union_endpoint(
    union_id: uuid.UUID,
    payload: UnionUpdate,
    conn: Connection = Depends(get_db_authenticated),
) -> UnionOut:
    """Edita somente os campos enviados (PATCH parcial). Editor/owner via RLS."""
    return update_union(conn, union_id, payload)


@router.delete("/api/unions/{union_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_union_endpoint(
    union_id: uuid.UUID,
    conn: Connection = Depends(get_db_authenticated),
) -> None:
    """Remove uma união e eventos em cascade (editor/owner via RLS)."""
    delete_union(conn, union_id)
