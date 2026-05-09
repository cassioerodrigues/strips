"""
union.py — schemas para uniões/relacionamentos (tabela `unions`).

Enums do banco:
  union_type_t:   'marriage' | 'civil_union' | 'partnership' | 'engagement' | 'other'
  union_status_t: 'ongoing' | 'divorced' | 'widowed' | 'annulled' | 'separated' | 'ended'
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

# Literals replicando os enums do banco
UnionType = Literal["marriage", "civil_union", "partnership", "engagement", "other"]
UnionStatus = Literal["ongoing", "divorced", "widowed", "annulled", "separated", "ended"]


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


class UnionCreate(BaseModel):
    tree_id: uuid.UUID
    partner_a_id: uuid.UUID
    partner_b_id: uuid.UUID

    type: UnionType = "marriage"
    status: UnionStatus = "ongoing"

    start_year: int | None = None
    start_month: int | None = None
    start_day: int | None = None
    start_place: str | None = None

    end_year: int | None = None
    end_month: int | None = None
    end_day: int | None = None
    end_place: str | None = None
    end_reason: str | None = None

    notes: str | None = None


# ---------------------------------------------------------------------------
# Update (PATCH parcial — todos os campos opcionais)
# ---------------------------------------------------------------------------


class UnionUpdate(BaseModel):
    type: UnionType | None = None
    status: UnionStatus | None = None

    start_year: int | None = None
    start_month: int | None = None
    start_day: int | None = None
    start_place: str | None = None

    end_year: int | None = None
    end_month: int | None = None
    end_day: int | None = None
    end_place: str | None = None
    end_reason: str | None = None

    notes: str | None = None


# ---------------------------------------------------------------------------
# Out (leitura do banco)
# ---------------------------------------------------------------------------


class UnionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tree_id: uuid.UUID
    partner_a_id: uuid.UUID
    partner_b_id: uuid.UUID

    type: UnionType = "marriage"
    status: UnionStatus = "ongoing"

    start_year: int | None = None
    start_month: int | None = None
    start_day: int | None = None
    start_place: str | None = None

    end_year: int | None = None
    end_month: int | None = None
    end_day: int | None = None
    end_place: str | None = None
    end_reason: str | None = None

    notes: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
