"""members.py — router de tree_members (/api/trees/{tree_id}/members).

Endpoints (Issue #13):
  GET    /api/trees/{tree_id}/members              → lista de membros (RLS filtra)
  POST   /api/trees/{tree_id}/members              → convidar por email (owner-only)
  PATCH  /api/trees/{tree_id}/members/{user_id}    → alterar role (owner-only)
  DELETE /api/trees/{tree_id}/members/{user_id}    → remover (owner-only)
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from psycopg import Connection

from app.auth import Claims
from app.deps import get_current_user, get_db_authenticated
from app.schemas.member import MemberInvite, MemberOut, MemberUpdate
from app.services.members import (
    invite_member,
    list_members,
    remove_member,
    update_member_role,
)

router = APIRouter(tags=["members"])


# ---------------------------------------------------------------------------
# Collection — /api/trees/{tree_id}/members
# ---------------------------------------------------------------------------


@router.get(
    "/api/trees/{tree_id}/members",
    response_model=list[MemberOut],
)
def list_members_endpoint(
    tree_id: uuid.UUID,
    conn: Connection = Depends(get_db_authenticated),
) -> list[MemberOut]:
    """Lista membros da árvore. Não-membros recebem [] (RLS filtra)."""
    return list_members(conn, tree_id)


@router.post(
    "/api/trees/{tree_id}/members",
    response_model=MemberOut,
    status_code=status.HTTP_201_CREATED,
)
def invite_member_endpoint(
    tree_id: uuid.UUID,
    payload: MemberInvite,
    user: Claims = Depends(get_current_user),
    conn: Connection = Depends(get_db_authenticated),
) -> MemberOut:
    """Convida um usuário existente (owner-only via RLS + função SECURITY DEFINER)."""
    return invite_member(conn, tree_id, user.sub, payload)


# ---------------------------------------------------------------------------
# Detail — /api/trees/{tree_id}/members/{user_id}
# ---------------------------------------------------------------------------


@router.patch(
    "/api/trees/{tree_id}/members/{user_id}",
    response_model=MemberOut,
)
def update_member_endpoint(
    tree_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: MemberUpdate,
    user: Claims = Depends(get_current_user),
    conn: Connection = Depends(get_db_authenticated),
) -> MemberOut:
    """Altera role de um membro (owner-only via RLS). Owner não pode demover a si mesmo."""
    return update_member_role(conn, tree_id, user_id, user.sub, payload)


@router.delete(
    "/api/trees/{tree_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_member_endpoint(
    tree_id: uuid.UUID,
    user_id: uuid.UUID,
    user: Claims = Depends(get_current_user),
    conn: Connection = Depends(get_db_authenticated),
) -> None:
    """Remove um membro (owner-only via RLS). Owner não pode remover a si mesmo."""
    remove_member(conn, tree_id, user_id, user.sub)
