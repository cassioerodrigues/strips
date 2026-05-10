"""
media.py — schemas para mídia (tabela `media`) e upload de arquivos.

Enums do banco:
  media_kind_t: 'photo' | 'document' | 'audio' | 'video' | 'other'
"""

from __future__ import annotations

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

        Validamos que:
          1. `storage_path` comeca com `tree_<tree_id>/` (mesma tree).
          2. O segundo segmento e um EntityType conhecido (defesa extra
             — limita a superficie a paths que `build_storage_path` poderia
             ter gerado).
        """
        expected_prefix = f"tree_{self.tree_id}/"
        if not self.storage_path.startswith(expected_prefix):
            raise ValueError(
                "storage_path does not match tree_id "
                f"(expected prefix {expected_prefix!r})"
            )
        # Segundo segmento: tree_<uuid>/<entity_type>/...
        rest = self.storage_path[len(expected_prefix):]
        entity_type, sep, _ = rest.partition("/")
        if not sep or entity_type not in _ALLOWED_STORAGE_ENTITY_TYPES:
            raise ValueError(
                "storage_path entity_type segment invalid "
                f"(expected one of {sorted(_ALLOWED_STORAGE_ENTITY_TYPES)})"
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
