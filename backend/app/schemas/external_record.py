"""
external_record.py — schemas para registros externos (tabela `external_records`).

Suporta o sistema de sugestões (FamilySearch e outras fontes) onde sugestões
chegam como `status='suggested'` e o usuário pode aceitá-las (vinculando a
uma pessoa) ou rejeitá-las.

Enums do banco:
  record_status_t: 'suggested' | 'accepted' | 'rejected'
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# Literal replicando record_status_t do banco.
RecordStatus = Literal["suggested", "accepted", "rejected"]


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


class ExternalRecordCreate(BaseModel):
    """Payload de criação manual de uma sugestão.

    Útil para popular o sistema antes da integração FamilySearch — um curador
    pode cadastrar manualmente um registro a ser revisado depois.
    """

    source: str = Field(min_length=1)
    source_id: str | None = None
    source_url: str | None = None
    title: str | None = None
    subtitle: str | None = None
    confidence: int | None = Field(default=None, ge=0, le=100)
    status: RecordStatus = "suggested"
    payload: dict[str, Any] | None = None
    person_id: uuid.UUID | None = None


# ---------------------------------------------------------------------------
# Update (PATCH parcial — só status e person_id são mutáveis pelo spec)
# ---------------------------------------------------------------------------


class ExternalRecordUpdate(BaseModel):
    """PATCH parcial — apenas `status` e `person_id` são editáveis.

    Quando `status` é incluído no body (mesmo que para o mesmo valor), o
    serviço preenche `reviewed_at = now()` e `reviewed_by = auth.uid()`.
    """

    status: RecordStatus | None = None
    person_id: uuid.UUID | None = None


# ---------------------------------------------------------------------------
# Out (leitura do banco)
# ---------------------------------------------------------------------------


class ExternalRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tree_id: uuid.UUID
    person_id: uuid.UUID | None = None

    source: str
    source_id: str | None = None
    source_url: str | None = None
    title: str | None = None
    subtitle: str | None = None
    confidence: int | None = None
    status: RecordStatus = "suggested"
    payload: dict[str, Any] | None = None

    created_at: datetime | None = None
    reviewed_at: datetime | None = None
    reviewed_by: uuid.UUID | None = None
