"""media.py — serviços de banco para a tabela `media`.

Usa SQL bruto via psycopg com dict_row.
A conexão já está numa transação com SET LOCAL configurado pelo
get_db_authenticated de deps.py — RLS é aplicado automaticamente.
"""
from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from psycopg import Connection
from psycopg.rows import dict_row

from app.schemas.media import MediaCreate, MediaOut


# ---------------------------------------------------------------------------
# Permission check (para upload-url, que NÃO toca a tabela media)
# ---------------------------------------------------------------------------


def assert_can_write_tree(conn: Connection, tree_id: uuid.UUID) -> None:
    """Levanta HTTPException(403) se o usuário não for owner/editor da árvore.

    Usada antes de assinar URLs de upload — como o endpoint só fala com
    o Supabase Storage e nunca insere em `media`, RLS sozinho não barra
    viewers/forasteiros. `tree_role(t)` retorna NULL para não-membros,
    e o IN(...) avalia para NULL/false → 403.
    """
    with conn.cursor() as cur:
        cur.execute("SELECT tree_role(%s) IN ('owner','editor')", (tree_id,))
        row = cur.fetchone()
    allowed = bool(row and row[0])
    if not allowed:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Only owner/editor can upload media to this tree",
        )


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


def create_media(
    conn: Connection,
    user_sub: uuid.UUID,
    payload: MediaCreate,
) -> MediaOut:
    """Insere um registro em `media` com o `storage_path` já existente
    (o cliente acabou de fazer PUT no Storage). RLS bloqueia viewers
    via policy `media_write` em 0007 → mapeado para 403 globalmente.
    """
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            INSERT INTO media(
                tree_id, kind, storage_path,
                mime_type, size_bytes,
                title, description,
                taken_year, taken_month, taken_day, taken_place,
                uploaded_by
            ) VALUES (
                %s, %s::media_kind_t, %s,
                %s, %s,
                %s, %s,
                %s, %s, %s, %s,
                %s
            )
            RETURNING
                id, tree_id, kind, storage_path,
                mime_type, size_bytes, title, description,
                taken_year, taken_month, taken_day, taken_place,
                uploaded_by, uploaded_at
            """,
            (
                payload.tree_id,
                payload.kind,
                payload.storage_path,
                payload.mime_type,
                payload.size_bytes,
                payload.title,
                payload.description,
                payload.taken_year,
                payload.taken_month,
                payload.taken_day,
                payload.taken_place,
                user_sub,
            ),
        )
        row = cur.fetchone()
        if row is None:  # pragma: no cover
            raise RuntimeError("INSERT INTO media RETURNING returned no row")
    return MediaOut.model_validate(row)


def get_media(conn: Connection, media_id: uuid.UUID) -> MediaOut:
    """Busca uma mídia pelo id. 404 se não existir ou RLS bloquear."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT
                id, tree_id, kind, storage_path,
                mime_type, size_bytes, title, description,
                taken_year, taken_month, taken_day, taken_place,
                uploaded_by, uploaded_at
            FROM media
            WHERE id = %s
            """,
            (media_id,),
        )
        row = cur.fetchone()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Media not found")
    return MediaOut.model_validate(row)


def delete_media_row(conn: Connection, media_id: uuid.UUID) -> str:
    """Remove a linha em `media`; cascade derruba person_media/event_media/union_media.

    Retorna `storage_path` para o caller invocar `delete_object()` no Storage
    DEPOIS do DELETE no banco. Se o Storage falhar, o caller deve levantar
    exceção — a transação faz rollback automático e a linha é restaurada.

    404 se a linha não existir / RLS bloquear (DELETE com 0 rows).
    """
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "DELETE FROM media WHERE id = %s RETURNING storage_path",
            (media_id,),
        )
        row = cur.fetchone()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Media not found")
    return row["storage_path"]
