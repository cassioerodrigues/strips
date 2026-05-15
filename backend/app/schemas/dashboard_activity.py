"""Schemas para atividade recente derivada do dashboard."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

DashboardActivityKind = Literal[
    "person_created",
    "person_updated",
    "media_uploaded",
    "suggestion_created",
    "suggestion_reviewed",
]


class DashboardActivityItem(BaseModel):
    """Item achatado para o feed de atividade da tela inicial."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    kind: DashboardActivityKind
    person_id: uuid.UUID | None = None
    title: str
    subtitle: str | None = None
    actor_name: str | None = None
    occurred_at: datetime
