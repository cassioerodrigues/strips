"""
member.py — schemas para tree_members (Issue #13).

Enums do banco:
  tree_role_t: 'owner' | 'editor' | 'viewer'

POST/PATCH só aceitam 'editor' e 'viewer'. O role 'owner' é exclusivo ao
criador da árvore e não pode ser atribuído via API (transferência de
ownership é fora do escopo desta issue).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr

# Roles que podem ser atribuídos via API. 'owner' fica fora intencionalmente.
AssignableRole = Literal["editor", "viewer"]


# ---------------------------------------------------------------------------
# Input
# ---------------------------------------------------------------------------


class MemberInvite(BaseModel):
    """Body de POST /api/trees/{tree_id}/members."""

    email: EmailStr
    role: AssignableRole


class MemberUpdate(BaseModel):
    """Body de PATCH /api/trees/{tree_id}/members/{user_id}."""

    role: AssignableRole


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------


class MemberOut(BaseModel):
    """Linha de tree_members + dados do profile relacionado."""

    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    display_name: str
    avatar_url: str | None = None
    role: Literal["owner", "editor", "viewer"]
    joined_at: datetime | None = None
