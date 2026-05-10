"""media.py — router de mídia (signed URLs do Supabase Storage)."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import Connection

from app.auth import Claims
from app.deps import get_current_user, get_db_authenticated
from app.schemas.media import (
    MediaCreate,
    MediaOut,
    UploadUrlRequest,
    UploadUrlResponse,
)
from app.services.media import (
    assert_can_write_tree,
    create_media,
    delete_media_row,
    get_media,
)
from app.storage import (
    create_download_url,
    create_upload_url,
    delete_object,
)

router = APIRouter(tags=["media"])


# ---------------------------------------------------------------------------
# Upload URL — antes de assinar valida tree_role via SQL.
# ---------------------------------------------------------------------------


@router.post(
    "/api/trees/{tree_id}/media/upload-url",
    response_model=UploadUrlResponse,
)
async def create_upload_url_endpoint(
    tree_id: uuid.UUID,
    payload: UploadUrlRequest,
    conn: Connection = Depends(get_db_authenticated),
) -> UploadUrlResponse:
    """Gera URL assinada para PUT direto pelo cliente no Supabase Storage.

    Valida via `tree_role(:tree_id) IN ('owner','editor')` antes de assinar —
    o endpoint não toca a tabela `media`, então RLS sozinho não barraria
    viewers/forasteiros. TTL de 5 min na URL.
    """
    assert_can_write_tree(conn, tree_id)
    result = await create_upload_url(
        tree_id=tree_id,
        entity_type=payload.entity_type,  # validado em build_storage_path
        entity_id=payload.entity_id,
        filename=payload.filename,
    )
    return UploadUrlResponse(**result)


# ---------------------------------------------------------------------------
# Registrar metadata após upload no Storage.
# ---------------------------------------------------------------------------


@router.post(
    "/api/trees/{tree_id}/media",
    response_model=MediaOut,
    status_code=status.HTTP_201_CREATED,
)
def create_media_endpoint(
    tree_id: uuid.UUID,
    payload: MediaCreate,
    user: Claims = Depends(get_current_user),
    conn: Connection = Depends(get_db_authenticated),
) -> MediaOut:
    """Registra metadata em `media`. RLS bloqueia viewers via policy media_write."""
    # tree_id do path é a fonte de verdade — sobrescreve qualquer valor no body
    # para evitar inconsistências (cliente que mande tree_id divergente leva 422?
    # — Optamos por silenciosamente alinhar ao path, mais permissivo e idiomático).
    if payload.tree_id != tree_id:
        raise HTTPException(422, "tree_id no body diverge do path")
    return create_media(conn, user.sub, payload)


# ---------------------------------------------------------------------------
# Download URL — RLS filtra; 404 se não acessível.
# ---------------------------------------------------------------------------


@router.get("/api/media/{media_id}/download-url")
async def get_download_url_endpoint(
    media_id: uuid.UUID,
    conn: Connection = Depends(get_db_authenticated),
) -> dict[str, str]:
    """Retorna URL assinada (TTL 1h) para GET do objeto no Storage.

    RLS filtra a SELECT — se 0 rows → 404 (esconde "forbidden vs not found").
    """
    media = get_media(conn, media_id)  # 404 se RLS bloquear
    url = await create_download_url(media.storage_path)
    return {"url": url}


# ---------------------------------------------------------------------------
# Delete — DELETE row primeiro, depois Storage. Rollback se Storage falhar.
# ---------------------------------------------------------------------------


@router.delete("/api/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_media_endpoint(
    media_id: uuid.UUID,
    conn: Connection = Depends(get_db_authenticated),
) -> None:
    """Remove `media` (cascade em person_media/event_media/union_media) e
    apaga o objeto no Storage.

    Ordem é DELETE-then-Storage em vez de Storage-then-DELETE: assim, se o
    Storage falhar (rede, permissões), `delete_object` levanta e a transação
    de `get_db_authenticated` faz rollback automático — a linha em `media`
    volta. Se fosse o inverso, o objeto sumiria mas a linha permaneceria
    apontando para um path morto, gerando 404 na próxima signed URL.
    """
    storage_path = delete_media_row(conn, media_id)  # 404 se RLS / inexistente
    # Se isto falhar, exceção propaga e o `with conn.transaction()` em
    # get_db_authenticated faz rollback do DELETE acima.
    await delete_object(storage_path)
