"""
auth.py — schemas relacionados a autenticação e perfil do usuário.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.person import PersonOut
from app.schemas.tree import TreeOut, TreeRole


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
    role: TreeRole
    joined_at: datetime | None = None
    person_id: uuid.UUID | None = None
    collaborators_count: int = 0


class SubscriptionOut(BaseModel):
    """Plano atualmente associado ao usuário autenticado."""

    code: str
    name: str
    collaborator_limit: int | None = None


# ---------------------------------------------------------------------------
# /me response
# ---------------------------------------------------------------------------


class MeResponse(BaseModel):
    """Resposta do endpoint GET /me: perfil + lista de árvores onde é membro."""

    model_config = ConfigDict(from_attributes=True)

    profile: ProfileOut
    trees: list[TreeMembershipOut] = []
    subscription: SubscriptionOut = Field(
        default_factory=lambda: SubscriptionOut(code="free", name="Gratis", collaborator_limit=0)
    )
    person: PersonOut | None = None
