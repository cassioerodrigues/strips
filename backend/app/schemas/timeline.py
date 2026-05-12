"""timeline.py — schemas para a view cronológica agregada de uma árvore.

`TimelineItem` representa um item unificado da timeline (#15):
nascimentos, mortes, uniões e eventos arbitrários, todos achatados em
uma única lista ordenada por data.
"""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict

# Tipos de item na timeline — Literal expõe validação para query params.
TimelineKind = Literal["event", "birth", "death", "union"]


class TimelineItem(BaseModel):
    """Item cronológico unificado.

    O campo `title` é renderizado em PT-BR pelo service layer (usa
    EVENT_TYPE_LABELS / UNION_TYPE_LABELS). O front exibe-o tal qual.

    Quanto aos ids:
      - `person_id` populado para kind in {birth, death} e eventos
        ligados a uma pessoa.
      - `union_id` populado para kind=union e eventos ligados a uma união.
      - Ambos podem estar presentes para eventos (raro, mas o schema permite).
    """

    model_config = ConfigDict(from_attributes=True)

    kind: TimelineKind
    year: int | None = None
    month: int | None = None
    day: int | None = None
    person_id: uuid.UUID | None = None
    union_id: uuid.UUID | None = None
    title: str
    place: str | None = None
    description: str | None = None
