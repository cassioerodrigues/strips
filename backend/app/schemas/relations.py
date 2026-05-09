"""
relations.py — schemas para relações familiares de uma pessoa.

Também expõe ParentLink para mapeamento de person_parents (tabela de filiação).

Enums do banco:
  parent_kind_t: 'biological' | 'adoptive' | 'step' | 'foster' | 'legal' | 'unknown'
"""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.person import PersonOut

# Literal replicando parent_kind_t do banco
ParentKind = Literal["biological", "adoptive", "step", "foster", "legal", "unknown"]


# ---------------------------------------------------------------------------
# ParentLink (para criar / consultar vínculos de filiação)
# ---------------------------------------------------------------------------


class ParentLinkCreate(BaseModel):
    child_id: uuid.UUID
    parent_id: uuid.UUID
    kind: ParentKind = "biological"
    notes: str | None = None


class ParentLinkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    child_id: uuid.UUID
    parent_id: uuid.UUID
    kind: ParentKind = "biological"
    notes: str | None = None


# ---------------------------------------------------------------------------
# RelationsResponse — grafo de relações de uma pessoa
# ---------------------------------------------------------------------------


class RelationsResponse(BaseModel):
    """Snapshot das relações familiares de uma pessoa específica."""

    parents: list[PersonOut] = []
    spouse: PersonOut | None = None
    siblings: list[PersonOut] = []
    children: list[PersonOut] = []
