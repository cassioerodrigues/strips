"""
person.py — schemas para pessoas (tabela `persons`).

Enums do banco:
  sex_t: 'M' | 'F' | 'O' | 'U'
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

# Literal replicando sex_t do banco
Sex = Literal["M", "F", "O", "U"]


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


class PersonCreate(BaseModel):
    # nome
    first_name: str | None = None
    middle_names: str | None = None
    last_name: str | None = None
    maiden_name: str | None = None
    display_name: str | None = None

    # básicos
    sex: Sex = "U"
    is_living: bool = True

    # nascimento (data parcial)
    birth_year: int | None = None
    birth_month: int | None = None
    birth_day: int | None = None
    birth_place: str | None = None

    # morte
    death_year: int | None = None
    death_month: int | None = None
    death_day: int | None = None
    death_place: str | None = None
    death_cause: str | None = None

    # biografia & metadata
    occupation: str | None = None
    bio: str | None = None
    tags: list[str] = []
    photo_media_id: uuid.UUID | None = None

    # IDs externos
    family_search_id: str | None = None
    gedcom_id: str | None = None
    external_ids: dict[str, Any] = {}


# ---------------------------------------------------------------------------
# Update (PATCH parcial — todos os campos opcionais)
# ---------------------------------------------------------------------------


class PersonUpdate(BaseModel):
    # nome
    first_name: str | None = None
    middle_names: str | None = None
    last_name: str | None = None
    maiden_name: str | None = None
    display_name: str | None = None

    # básicos
    sex: Sex | None = None
    is_living: bool | None = None

    # nascimento
    birth_year: int | None = None
    birth_month: int | None = None
    birth_day: int | None = None
    birth_place: str | None = None

    # morte
    death_year: int | None = None
    death_month: int | None = None
    death_day: int | None = None
    death_place: str | None = None
    death_cause: str | None = None

    # biografia & metadata
    occupation: str | None = None
    bio: str | None = None
    tags: list[str] | None = None
    photo_media_id: uuid.UUID | None = None

    # IDs externos
    family_search_id: str | None = None
    gedcom_id: str | None = None
    external_ids: dict[str, Any] | None = None


# ---------------------------------------------------------------------------
# Out (leitura do banco)
# ---------------------------------------------------------------------------


class PersonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tree_id: uuid.UUID

    # nome
    first_name: str | None = None
    middle_names: str | None = None
    last_name: str | None = None
    maiden_name: str | None = None
    display_name: str | None = None

    # básicos
    sex: Sex = "U"
    is_living: bool = True

    # nascimento
    birth_year: int | None = None
    birth_month: int | None = None
    birth_day: int | None = None
    birth_place: str | None = None

    # morte
    death_year: int | None = None
    death_month: int | None = None
    death_day: int | None = None
    death_place: str | None = None
    death_cause: str | None = None

    # biografia & metadata
    occupation: str | None = None
    bio: str | None = None
    tags: list[str] = []
    photo_media_id: uuid.UUID | None = None

    # IDs externos
    family_search_id: str | None = None
    gedcom_id: str | None = None
    external_ids: dict[str, Any] = {}

    # auditoria
    created_by: uuid.UUID | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
