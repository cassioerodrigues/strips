"""auth.py — router do endpoint /api/me."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from psycopg import Connection

from app.auth import Claims
from app.deps import get_current_user, get_db_authenticated
from app.schemas.auth import MeResponse
from app.services.trees import get_me

router = APIRouter(prefix="/api", tags=["auth"])


@router.get("/me", response_model=MeResponse)
def me(
    user: Claims = Depends(get_current_user),
    conn: Connection = Depends(get_db_authenticated),
) -> MeResponse:
    """Retorna profile do usuário autenticado + lista de árvores onde é membro."""
    return get_me(conn, user.sub)
