"""
media.py — schemas para mídia (tabela `media`) e upload de arquivos.

Enums do banco:
  media_kind_t: 'photo' | 'document' | 'audio' | 'video' | 'other'
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

# Literal replicando media_kind_t do banco
MediaKind = Literal["photo", "document", "audio", "video", "other"]


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


# ---------------------------------------------------------------------------
# Upload URL request / response (presigned URL para Supabase Storage)
# ---------------------------------------------------------------------------


class UploadUrlRequest(BaseModel):
    filename: str
    mime_type: str
    entity_type: str   # e.g. 'person', 'union', 'event'
    entity_id: uuid.UUID


class UploadUrlResponse(BaseModel):
    url: str
    storage_path: str
    expires_at: datetime
