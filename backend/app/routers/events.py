"""events.py — router de eventos GEDCOM (/api/trees/{tree_id}/events e /api/events/{id})."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from psycopg import Connection

from app.deps import get_db_authenticated
from app.schemas.event import EventCreate, EventOut, EventType, EventUpdate
from app.services.events import create_event, delete_event, list_events, update_event

router = APIRouter(tags=["events"])


# ---------------------------------------------------------------------------
# Collection endpoints — /api/trees/{tree_id}/events
# ---------------------------------------------------------------------------


@router.get("/api/trees/{tree_id}/events", response_model=list[EventOut])
def list_events_endpoint(
    tree_id: uuid.UUID,
    from_year: int | None = Query(default=None, description="Filtrar eventos a partir deste ano (inclusive)"),
    to_year: int | None = Query(default=None, description="Filtrar eventos até este ano (inclusive)"),
    event_type: EventType | None = Query(default=None, alias="type", description="Filtrar por tipo de evento"),
    person_id: uuid.UUID | None = Query(default=None, description="Filtrar por pessoa"),
    union_id: uuid.UUID | None = Query(default=None, description="Filtrar por união"),
    conn: Connection = Depends(get_db_authenticated),
) -> list[EventOut]:
    """Lista eventos de uma árvore com filtros opcionais, ordenados por year ASC."""
    return list_events(conn, tree_id, from_year, to_year, event_type, person_id, union_id)


@router.post(
    "/api/trees/{tree_id}/events",
    response_model=EventOut,
    status_code=status.HTTP_201_CREATED,
)
def create_event_endpoint(
    tree_id: uuid.UUID,
    payload: EventCreate,
    conn: Connection = Depends(get_db_authenticated),
) -> EventOut:
    """Cria um novo evento na árvore.

    Requer pelo menos um de `person_id` ou `union_id` (validado pelo schema Pydantic → 422).
    """
    return create_event(conn, tree_id, payload)


# ---------------------------------------------------------------------------
# Detail endpoints — /api/events/{id}
# ---------------------------------------------------------------------------


@router.patch("/api/events/{event_id}", response_model=EventOut)
def update_event_endpoint(
    event_id: uuid.UUID,
    payload: EventUpdate,
    conn: Connection = Depends(get_db_authenticated),
) -> EventOut:
    """Edita somente os campos enviados (PATCH parcial). Editor/owner via RLS."""
    return update_event(conn, event_id, payload)


@router.delete("/api/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event_endpoint(
    event_id: uuid.UUID,
    conn: Connection = Depends(get_db_authenticated),
) -> None:
    """Remove um evento (editor/owner via RLS)."""
    delete_event(conn, event_id)
