"""timeline.py — router da timeline agregada (/api/trees/{tree_id}/timeline).

Issue #15. Endpoint single-purpose, sem POST/PATCH/DELETE — a timeline
é uma view derivada de events/persons/unions.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from psycopg import Connection

from app.deps import get_db_authenticated
from app.schemas.timeline import TimelineItem, TimelineKind
from app.services.timeline import get_timeline

router = APIRouter(tags=["timeline"])


@router.get("/api/trees/{tree_id}/timeline", response_model=list[TimelineItem])
def get_timeline_endpoint(
    tree_id: uuid.UUID,
    from_year: int | None = Query(default=None, ge=-32768, le=32767),
    to_year: int | None = Query(default=None, ge=-32768, le=32767),
    kind: list[TimelineKind] | None = Query(default=None),
    conn: Connection = Depends(get_db_authenticated),
) -> list[TimelineItem]:
    """Retorna a timeline cronológica unificada da árvore.

    Filtros opcionais:
      - ?from_year=AAAA / ?to_year=AAAA — bounds inclusivos sobre o ano.
      - ?kind=birth&kind=death — filtro multi-valor (repetir o param).

    Ordem: (year, month, day) ASC NULLS LAST. 404 se a árvore não for
    visível ao usuário autenticado (RLS).
    """
    return get_timeline(conn, tree_id, from_year, to_year, kind)
