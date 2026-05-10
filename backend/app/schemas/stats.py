"""stats.py — schemas para agregados do dashboard de uma árvore."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class TreeStatsOut(BaseModel):
    """Contadores agregados exibidos nos cards do dashboard."""

    model_config = ConfigDict(from_attributes=True)

    total_people: int
    generations: int
    countries: int
    media_count: int
    unions_count: int
    events_count: int
