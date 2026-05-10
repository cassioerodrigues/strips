"""stats.py — router de agregados do dashboard (/api/trees/{tree_id}/stats)."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from psycopg import Connection

from app.deps import get_db_authenticated
from app.schemas.stats import TreeStatsOut
from app.services.stats import get_tree_stats

router = APIRouter(tags=["stats"])


@router.get("/api/trees/{tree_id}/stats", response_model=TreeStatsOut)
def get_tree_stats_endpoint(
    tree_id: uuid.UUID,
    conn: Connection = Depends(get_db_authenticated),
) -> TreeStatsOut:
    """Retorna contadores agregados para os cards do dashboard.

    Inclui total de pessoas, gerações distintas, países distintos (heurística
    sobre birth_place + external_ids.country), e contagens diretas de mídias,
    uniões e eventos. RLS filtra todas as subqueries; 404 se a árvore não for
    visível ao usuário.
    """
    return get_tree_stats(conn, tree_id)
