"""people.py — router de pessoas (/api/trees/{tree_id}/people e /api/people/{id})."""
from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query, status
from psycopg import Connection

from app.auth import Claims
from app.deps import get_current_user, get_db_authenticated
from app.schemas.event import EventOut
from app.schemas.media import MediaLinkPayload, MediaOut
from app.schemas.person import PersonCreate, PersonOut, PersonUpdate
from app.schemas.relations import RelationsResponse
from app.services.people import (
    create_person,
    delete_person,
    get_person,
    get_person_events,
    get_person_media,
    link_media,
    list_people,
    unlink_media,
    update_person,
    get_relations,
)

router = APIRouter(tags=["people"])

# Whitelist de sort values (Literal garante validação pelo FastAPI antes de chegar ao service).
SortKey = Literal["name", "year", "generation"]


# ---------------------------------------------------------------------------
# Collection endpoints — /api/trees/{tree_id}/people
# ---------------------------------------------------------------------------


@router.get("/api/trees/{tree_id}/people", response_model=list[PersonOut])
def list_people_endpoint(
    tree_id: uuid.UUID,
    search: str | None = Query(default=None),
    sort: SortKey = Query(default="name"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    conn: Connection = Depends(get_db_authenticated),
) -> list[PersonOut]:
    """Lista paginada de pessoas numa árvore com filtros opcionais de busca e ordenação."""
    return list_people(conn, tree_id, search, sort, limit, offset)


@router.post(
    "/api/trees/{tree_id}/people",
    response_model=PersonOut,
    status_code=status.HTTP_201_CREATED,
)
def create_person_endpoint(
    tree_id: uuid.UUID,
    payload: PersonCreate,
    user: Claims = Depends(get_current_user),
    conn: Connection = Depends(get_db_authenticated),
) -> PersonOut:
    """Cria uma nova pessoa na árvore especificada (editor/owner via RLS)."""
    return create_person(conn, tree_id, user.sub, payload)


# ---------------------------------------------------------------------------
# Detail endpoints — /api/people/{id}
# ---------------------------------------------------------------------------


@router.get("/api/people/{person_id}", response_model=PersonOut)
def get_person_endpoint(
    person_id: uuid.UUID,
    conn: Connection = Depends(get_db_authenticated),
) -> PersonOut:
    """Retorna detalhe de uma pessoa. 404 se não existir ou sem acesso (RLS)."""
    return get_person(conn, person_id)


@router.patch("/api/people/{person_id}", response_model=PersonOut)
def update_person_endpoint(
    person_id: uuid.UUID,
    payload: PersonUpdate,
    conn: Connection = Depends(get_db_authenticated),
) -> PersonOut:
    """Edita somente os campos enviados (PATCH parcial). Editor/owner via RLS."""
    return update_person(conn, person_id, payload)


@router.delete("/api/people/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_person_endpoint(
    person_id: uuid.UUID,
    conn: Connection = Depends(get_db_authenticated),
) -> None:
    """Remove pessoa e relações em cascade (editor/owner via RLS)."""
    delete_person(conn, person_id)


# ---------------------------------------------------------------------------
# Relations
# ---------------------------------------------------------------------------


@router.get("/api/people/{person_id}/relations", response_model=RelationsResponse)
def get_relations_endpoint(
    person_id: uuid.UUID,
    conn: Connection = Depends(get_db_authenticated),
) -> RelationsResponse:
    """Retorna pais, cônjuge, irmãos e filhos da pessoa."""
    return get_relations(conn, person_id)


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------


@router.get("/api/people/{person_id}/events", response_model=list[EventOut])
def get_person_events_endpoint(
    person_id: uuid.UUID,
    conn: Connection = Depends(get_db_authenticated),
) -> list[EventOut]:
    """Retorna eventos da pessoa ordenados por ano."""
    return get_person_events(conn, person_id)


# ---------------------------------------------------------------------------
# Media
# ---------------------------------------------------------------------------


@router.get("/api/people/{person_id}/media", response_model=list[MediaOut])
def get_person_media_endpoint(
    person_id: uuid.UUID,
    conn: Connection = Depends(get_db_authenticated),
) -> list[MediaOut]:
    """Retorna mídias vinculadas à pessoa.

    download_url é sempre None nesta versão — a Issue #8 implementa
    app/storage.py com geração de signed URLs do Supabase Storage.
    """
    return get_person_media(conn, person_id)


@router.post(
    "/api/people/{person_id}/media/{media_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def link_media_endpoint(
    person_id: uuid.UUID,
    media_id: uuid.UUID,
    payload: MediaLinkPayload | None = None,
    conn: Connection = Depends(get_db_authenticated),
) -> None:
    """Vincula mídia à pessoa. Se is_primary=True no body, define como foto principal."""
    is_primary = payload.is_primary if payload else False
    link_media(conn, person_id, media_id, is_primary)


@router.delete(
    "/api/people/{person_id}/media/{media_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def unlink_media_endpoint(
    person_id: uuid.UUID,
    media_id: uuid.UUID,
    conn: Connection = Depends(get_db_authenticated),
) -> None:
    """Remove vínculo entre pessoa e mídia."""
    unlink_media(conn, person_id, media_id)
