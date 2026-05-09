"""
tree.py — schemas para árvores genealógicas (tabela `trees` + `tree_members`).

Enums do banco:
  tree_role_t: 'owner' | 'editor' | 'viewer'
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

# Literal replicando tree_role_t do banco
TreeRole = Literal["owner", "editor", "viewer"]


# ---------------------------------------------------------------------------
# Create / Update
# ---------------------------------------------------------------------------


class TreeCreate(BaseModel):
    name: str
    description: str | None = None


class TreeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


# ---------------------------------------------------------------------------
# Out (leitura do banco)
# ---------------------------------------------------------------------------


class TreeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    description: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
