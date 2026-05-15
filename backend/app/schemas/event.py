"""
event.py — schemas para eventos (tabela `events`).

Enums do banco:
  event_type_t: todos os valores definidos em 0001_extensions_and_enums.sql

Regra de negócio (replica o check da migration 0005):
  person_id OU union_id deve estar setado (mas não ambos ausentes).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

# Literal replicando event_type_t do banco (0001_extensions_and_enums.sql)
EventType = Literal[
    # religiosos / ritos de passagem
    "baptism",
    "christening",
    "confirmation",
    "first_communion",
    "bar_mitzvah",
    "bat_mitzvah",
    "ordination",
    "blessing",
    # vida
    "adoption",
    "engagement",
    "graduation",
    "retirement",
    "occupation",
    "education",
    "military",
    "residence",
    # migração
    "immigration",
    "emigration",
    "naturalization",
    # registros oficiais
    "census",
    "will",
    "probate",
    "obituary",
    # pós-morte
    "burial",
    "cremation",
    # escape hatch
    "religion",
    "custom",
]


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


class EventCreate(BaseModel):
    person_id: uuid.UUID | None = None
    union_id: uuid.UUID | None = None
    related_person_ids: list[uuid.UUID] = Field(default_factory=list)

    type: EventType
    custom_label: str | None = None  # usado quando type='custom'

    year: int | None = None
    month: int | None = None
    day: int | None = None
    place: str | None = None
    description: str | None = None

    @model_validator(mode="after")
    def _require_person_or_union(self) -> "EventCreate":
        """Replica o check da migration 0005: person_id IS NOT NULL OR union_id IS NOT NULL."""
        if self.person_id is None and self.union_id is None:
            raise ValueError("At least one of 'person_id' or 'union_id' must be set.")
        return self


# ---------------------------------------------------------------------------
# Update (PATCH parcial — todos os campos opcionais)
# ---------------------------------------------------------------------------


class EventUpdate(BaseModel):
    related_person_ids: list[uuid.UUID] | None = None

    type: EventType | None = None
    custom_label: str | None = None

    year: int | None = None
    month: int | None = None
    day: int | None = None
    place: str | None = None
    description: str | None = None


# ---------------------------------------------------------------------------
# Out (leitura do banco)
# ---------------------------------------------------------------------------


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tree_id: uuid.UUID
    person_id: uuid.UUID | None = None
    union_id: uuid.UUID | None = None
    related_person_ids: list[uuid.UUID] = Field(default_factory=list)

    type: EventType
    custom_label: str | None = None

    year: int | None = None
    month: int | None = None
    day: int | None = None
    place: str | None = None
    description: str | None = None

    created_at: datetime | None = None
