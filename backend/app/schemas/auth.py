"""
auth.py — schemas relacionados a autenticação e perfil do usuário.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.tree import TreeOut


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    display_name: str
    avatar_url: str | None = None
    locale: str | None = "pt-BR"
    created_at: datetime | None = None
    updated_at: datetime | None = None


# ---------------------------------------------------------------------------
# Membership inline (para MeResponse)
# ---------------------------------------------------------------------------


class TreeMembershipOut(BaseModel):
    """Entrada de árvore + role do usuário autenticado."""

    model_config = ConfigDict(from_attributes=True)

    tree: TreeOut
    role: str  # 'owner' | 'editor' | 'viewer'
    joined_at: datetime | None = None


# ---------------------------------------------------------------------------
# /me response
# ---------------------------------------------------------------------------


class MeResponse(BaseModel):
    """Resposta do endpoint GET /me: perfil + lista de árvores onde é membro."""

    model_config = ConfigDict(from_attributes=True)

    profile: ProfileOut
    trees: list[TreeMembershipOut] = []
