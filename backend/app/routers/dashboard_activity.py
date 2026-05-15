"""Router de atividade recente do dashboard."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from psycopg import Connection

from app.deps import get_db_authenticated
from app.schemas.dashboard_activity import DashboardActivityItem
from app.services.dashboard_activity import get_dashboard_activity

router = APIRouter(tags=["dashboard_activity"])


@router.get(
    "/api/trees/{tree_id}/dashboard-activity",
    response_model=list[DashboardActivityItem],
)
def get_dashboard_activity_endpoint(
    tree_id: uuid.UUID,
    limit: int = Query(default=6, ge=1, le=50),
    conn: Connection = Depends(get_db_authenticated),
) -> list[DashboardActivityItem]:
    """Retorna atividade recente derivada para a tela inicial."""
    return get_dashboard_activity(conn, tree_id, limit)
