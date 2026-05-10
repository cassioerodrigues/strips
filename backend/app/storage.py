"""storage.py — wrapper async sobre o REST do Supabase Storage.

Este módulo encapsula as chamadas HTTP para a API de Storage do Supabase,
expostas via SUPABASE_URL/storage/v1/*. Como é a API quem assina URLs em nome
do usuário, usamos `SUPABASE_SERVICE_ROLE_KEY` no header `Authorization`.

Funções públicas:
  - safe_filename(name) -> str
        Sanitiza um nome de arquivo para uso seguro como sufixo do path.
  - create_upload_url(tree_id, entity_type, entity_id, filename) -> dict
        Gera URL assinada de upload (PUT direto pelo cliente). TTL 5 min.
  - create_download_url(storage_path) -> str
        Gera URL assinada de download. TTL 1 h.
  - delete_object(storage_path) -> None
        Apaga um objeto do bucket.

Path scheme (compatível com `0008_storage_policies.sql`):
    tree_<tree_id_uuid>/<entity_type>/<entity_id_uuid>/<uuid4>-<safe_filename>

As policies do bucket `stirps-media` extraem `tree_id` da primeira pasta
(`storage.foldername(name)[1]` removendo o prefixo `tree_`) — qualquer
divergência aqui quebra o RLS de Storage.
"""
from __future__ import annotations

import re
import unicodedata
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

import httpx
from fastapi import HTTPException, status

from app.config import get_settings

# Tipos de entidade aceitos no path scheme. `tree` é mídia genérica da árvore
# (ex.: capa, brasão), sem vínculo a uma pessoa/união/evento específico.
EntityType = Literal["person", "union", "event", "tree"]
_ALLOWED_ENTITY_TYPES: frozenset[str] = frozenset({"person", "union", "event", "tree"})

# TTLs em segundos
_UPLOAD_TTL_SECONDS = 5 * 60        # 5 min
_DOWNLOAD_TTL_SECONDS = 60 * 60     # 1 h

_HTTP_TIMEOUT_SECONDS = 10.0

# Regex de caracteres permitidos no nome sanitizado.
_SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]")
_MAX_FILENAME_LEN = 100


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


def safe_filename(name: str) -> str:
    """Sanitiza um nome de arquivo para uso seguro em paths de Storage.

    Passos:
      1. Normaliza unicode para NFKC.
      2. Remove sequências `..`, `/`, `\\`, NUL bytes.
      3. Substitui qualquer caractere fora de [A-Za-z0-9._-] por `_`.
      4. Limita a 100 chars.
      5. Se vazio após sanitização, retorna "file".
    """
    if not isinstance(name, str):  # defensivo — Pydantic já garante str
        return "file"

    # 1. NFKC para normalizar caracteres compostos (ex.: "ﬁ" → "fi").
    s = unicodedata.normalize("NFKC", name)

    # 2. Remove path separators e NUL antes do replace genérico, para que
    #    nada com semântica de diretório passe ao Storage.
    s = s.replace("..", "_").replace("/", "_").replace("\\", "_").replace("\x00", "_")

    # 3. Substitui qualquer caractere remanescente fora da whitelist.
    s = _SAFE_FILENAME_RE.sub("_", s)

    # 4. Tira leading dots para evitar arquivos ocultos / "." / ".." residuais.
    s = s.lstrip(".")

    # 5. Limite de tamanho.
    s = s[:_MAX_FILENAME_LEN]

    # 6. Vazio após tudo? fallback.
    return s or "file"


def build_storage_path(
    tree_id: uuid.UUID,
    entity_type: EntityType,
    entity_id: uuid.UUID,
    filename: str,
) -> str:
    """Monta o path canônico no bucket. Não toca em rede.

    Levanta HTTPException(422) se entity_type não estiver na whitelist.
    """
    if entity_type not in _ALLOWED_ENTITY_TYPES:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"entity_type inválido: {entity_type!r}. Esperado um de "
            f"{sorted(_ALLOWED_ENTITY_TYPES)}.",
        )
    sf = safe_filename(filename)
    return f"tree_{tree_id}/{entity_type}/{entity_id}/{uuid.uuid4()}-{sf}"


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------


def _service_headers() -> dict[str, str]:
    settings = get_settings()
    if not settings.supabase_service_role_key:
        # Configuração ausente: 500 explícito em vez de 401 confuso do Supabase.
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "SUPABASE_SERVICE_ROLE_KEY not configured",
        )
    return {
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        # apikey é exigido por algumas configurações do gateway Supabase.
        "apikey": settings.supabase_service_role_key,
        "Content-Type": "application/json",
    }


def _storage_base() -> str:
    settings = get_settings()
    if not settings.supabase_url:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "SUPABASE_URL not configured",
        )
    # Remove trailing slash para concatenação previsível.
    return settings.supabase_url.rstrip("/")


def _bucket() -> str:
    return get_settings().supabase_storage_bucket


def _absolute_signed_url(relative_or_absolute: str) -> str:
    """Recebe a URL retornada pelo Supabase Storage (geralmente relativa
    a `/object/...`) e devolve uma URL absoluta apontando para
    `{SUPABASE_URL}/storage/v1{...}`. Aceita também URLs já absolutas.
    """
    if relative_or_absolute.startswith(("http://", "https://")):
        return relative_or_absolute
    # As URLs retornadas começam com "/object/...". O endpoint vive em
    # /storage/v1, então concatenamos.
    rel = relative_or_absolute if relative_or_absolute.startswith("/") else f"/{relative_or_absolute}"
    return f"{_storage_base()}/storage/v1{rel}"


def _raise_for_status(resp: httpx.Response, action: str) -> None:
    """Levanta 502 com payload do Supabase em caso de erro.

    httpx por default não levanta para status != 2xx, então tratamos
    explicitamente — assim o cliente recebe 502 em vez de 500 genérico.
    """
    if 200 <= resp.status_code < 300:
        return
    # Tenta extrair mensagem JSON; se não der, usa texto cru.
    try:
        body = resp.json()
        msg = body.get("message") or body.get("error") or str(body)
    except ValueError:
        msg = resp.text or f"HTTP {resp.status_code}"
    raise HTTPException(
        status.HTTP_502_BAD_GATEWAY,
        f"Storage error during {action}: {msg}",
    )


# ---------------------------------------------------------------------------
# Public async API
# ---------------------------------------------------------------------------


async def create_upload_url(
    tree_id: uuid.UUID,
    entity_type: EntityType,
    entity_id: uuid.UUID,
    filename: str,
) -> dict:
    """Solicita ao Supabase uma URL assinada para PUT direto pelo cliente.

    Retorna `{"url", "storage_path", "expires_at"}` onde `url` é a URL
    absoluta pronta para `curl -X PUT --data-binary @arquivo "<url>"`.
    TTL de 5 min — o frontend deve fazer o upload imediatamente.
    """
    storage_path = build_storage_path(tree_id, entity_type, entity_id, filename)

    base = _storage_base()
    bucket = _bucket()
    endpoint = f"{base}/storage/v1/object/upload/sign/{bucket}/{storage_path}"
    payload = {"expiresIn": _UPLOAD_TTL_SECONDS}

    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as client:
        resp = await client.post(endpoint, headers=_service_headers(), json=payload)

    _raise_for_status(resp, "upload-url sign")

    body = resp.json()
    # O endpoint retorna `{"url": "/object/upload/sign/<bucket>/<path>?token=..."}`.
    rel = body.get("url")
    if not rel:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Storage returned no signed url for upload",
        )

    expires_at = datetime.now(timezone.utc) + timedelta(seconds=_UPLOAD_TTL_SECONDS)
    return {
        "url": _absolute_signed_url(rel),
        "storage_path": storage_path,
        "expires_at": expires_at,
    }


async def create_download_url(storage_path: str) -> str:
    """Gera URL assinada para download (GET). TTL 1 h."""
    base = _storage_base()
    bucket = _bucket()
    endpoint = f"{base}/storage/v1/object/sign/{bucket}/{storage_path}"
    payload = {"expiresIn": _DOWNLOAD_TTL_SECONDS}

    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as client:
        resp = await client.post(endpoint, headers=_service_headers(), json=payload)

    _raise_for_status(resp, "download-url sign")

    body = resp.json()
    # Note: este endpoint usa `signedURL` (camelCase com URL maiúsculo);
    # toleramos variações observadas em diferentes versões do gateway.
    rel = body.get("signedURL") or body.get("signedUrl") or body.get("url")
    if not rel:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Storage returned no signed url for download",
        )
    return _absolute_signed_url(rel)


async def delete_object(storage_path: str) -> None:
    """Apaga um objeto do bucket. 200/204 = ok; outros status → 502."""
    base = _storage_base()
    bucket = _bucket()
    endpoint = f"{base}/storage/v1/object/{bucket}/{storage_path}"

    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as client:
        resp = await client.delete(endpoint, headers=_service_headers())

    _raise_for_status(resp, "object delete")
