"""
media.py — schemas para mídia (tabela `media`) e upload de arquivos.

Enums do banco:
  media_kind_t: 'photo' | 'document' | 'audio' | 'video' | 'other'
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, model_validator

# Literal replicando media_kind_t do banco
MediaKind = Literal["photo", "document", "audio", "video", "other"]

# EntityType permitido no segundo segmento do storage_path. Replicado de
# app/storage.py::EntityType para evitar import circular schemas <-> storage.
StorageEntityType = Literal["person", "union", "event", "tree"]
_ALLOWED_STORAGE_ENTITY_TYPES: frozenset[str] = frozenset(
    {"person", "union", "event", "tree"}
)

# Regex estrita para storage_path: precisa casar EXATAMENTE o formato que
# `app.storage.build_storage_path` produz, ou seja:
#   tree_<uuid>/<entity_type>/<uuid>/<filename-sem-barra>
# Checagem por regex evita bypass via path traversal nos segmentos
# (ex.: "tree_<A>/person/../../tree_<B>/...") que `startswith` + `partition`
# não detectam.
_STORAGE_PATH_RE = re.compile(
    r"^tree_(?P<tree>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"
    r"/(?P<entity>person|union|event|tree)"
    r"/(?P<entity_id>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"
    r"/(?P<filename>[^/]+)$"
)


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


class MediaCreate(BaseModel):
    tree_id: uuid.UUID
    kind: MediaKind
    storage_path: str
    mime_type: str | None = None
    size_bytes: int | None = None
    title: str | None = None
    description: str | None = None
    taken_year: int | None = None
    taken_month: int | None = None
    taken_day: int | None = None
    taken_place: str | None = None

    @model_validator(mode="after")
    def _validate_storage_path_prefix(self) -> "MediaCreate":
        """Defesa em profundidade contra cross-tenant em Storage.

        RLS de `media` valida que o usuario e editor da `tree_id` informada,
        mas `storage_path` e text livre — sem esta checagem, um editor da
        tree A poderia inserir em `media` apontando para um objeto de tree B
        e depois usar o endpoint de download/delete (que usa SERVICE_ROLE
        e bypassa Storage RLS) para vazar/apagar o objeto da tree B.

        Validamos que `storage_path` casa EXATAMENTE o formato que
        `app.storage.build_storage_path` produz:
          tree_<tree_id>/<entity_type>/<entity_id>/<filename>

        Checagem por regex (em vez de startswith + partition) bloqueia
        bypass via path traversal nos segmentos, ex.:
          tree_<A>/person/../../tree_<B>/person/<id>/secret.jpg
        Como o gateway Supabase Storage normaliza `..`, o atacante editor
        de A acessaria objetos de B sem essa validacao.
        """
        m = _STORAGE_PATH_RE.match(self.storage_path)
        if not m:
            raise ValueError(
                "storage_path malformed (expected "
                "'tree_<uuid>/<person|union|event|tree>/<uuid>/<filename>')"
            )
        if m["tree"] != str(self.tree_id):
            raise ValueError(
                "storage_path does not match tree_id "
                f"(expected tree_{self.tree_id})"
            )
        filename = m["filename"]
        # Filename nao pode conter `\` (path separator do Windows que o
        # gateway pode normalizar), nao pode ser `.` ou `..` (resolveriam
        # para o diretorio pai apos normalizacao), e nao pode comecar com
        # `.` (arquivo oculto / nome degenerado).
        if (
            filename in (".", "..")
            or "\\" in filename
            or filename.startswith(".")
        ):
            raise ValueError(
                "storage_path filename segment invalid "
                "(must not be '.', '..', start with '.', or contain '\\\\')"
            )
        return self


# ---------------------------------------------------------------------------
# Out (leitura do banco)
# ---------------------------------------------------------------------------


class MediaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tree_id: uuid.UUID
    kind: MediaKind
    storage_path: str
    mime_type: str | None = None
    size_bytes: int | None = None
    title: str | None = None
    description: str | None = None
    taken_year: int | None = None
    taken_month: int | None = None
    taken_day: int | None = None
    taken_place: str | None = None
    uploaded_by: uuid.UUID | None = None
    uploaded_at: datetime | None = None
    download_url: str | None = None


# ---------------------------------------------------------------------------
# Upload URL request / response (presigned URL para Supabase Storage)
# ---------------------------------------------------------------------------


class UploadUrlRequest(BaseModel):
    filename: str
    mime_type: str
    # Tipado como Literal para falhar em 422 antes de tocar o banco.
    # Replica EntityType de app/storage.py.
    entity_type: StorageEntityType
    entity_id: uuid.UUID


class UploadUrlResponse(BaseModel):
    url: str
    storage_path: str
    expires_at: datetime


# ---------------------------------------------------------------------------
# MediaLinkPayload — body para POST /api/people/{id}/media/{media_id}
# ---------------------------------------------------------------------------


class MediaLinkPayload(BaseModel):
    is_primary: bool = False
