"""
test_storage.py — testes unitários de app/storage.py.

Cobre:
  1. safe_filename — sanitização (unicode, path traversal, whitelist).
  2. build_storage_path — formato do path + validação de entity_type.
  3. create_upload_url / create_download_url / delete_object — mocks de
     httpx via respx.

Sem rede real: todas as chamadas HTTP são interceptadas por respx.
"""
from __future__ import annotations

import re
import uuid

import httpx
import pytest
import respx
from fastapi import HTTPException

from app.config import get_settings
from app.storage import (
    build_storage_path,
    create_download_url,
    create_upload_url,
    delete_object,
    safe_filename,
)


# ---------------------------------------------------------------------------
# Fixtures — força valores conhecidos em get_settings para testar os endpoints.
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _patch_settings(monkeypatch):
    """Reseta o cache de get_settings e injeta valores fake."""
    get_settings.cache_clear()
    monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test")
    monkeypatch.setenv("SUPABASE_STORAGE_BUCKET", "stirps-media")
    yield
    get_settings.cache_clear()


# ---------------------------------------------------------------------------
# 1. safe_filename
# ---------------------------------------------------------------------------


class TestSafeFilename:
    def test_simple_name_passes_through(self):
        assert safe_filename("foto.jpg") == "foto.jpg"

    def test_allows_dot_dash_underscore(self):
        assert safe_filename("my_file-v2.tar.gz") == "my_file-v2.tar.gz"

    def test_replaces_spaces(self):
        assert safe_filename("minha foto.jpg") == "minha_foto.jpg"

    def test_strips_path_traversal(self):
        out = safe_filename("../../etc/passwd")
        # `..` virou `_`, `/` virou `_`
        assert ".." not in out
        assert "/" not in out
        # Assert deterministico: cada `..` e cada `/` viram `_`,
        # producao final esperada e "____etc_passwd".
        assert out == "____etc_passwd"

    def test_strips_backslash(self):
        out = safe_filename(r"foo\bar.jpg")
        assert "\\" not in out

    def test_strips_null_byte(self):
        out = safe_filename("foo\x00bar.jpg")
        assert "\x00" not in out
        assert "foo" in out and "bar.jpg" in out

    def test_normalizes_unicode_nfkc(self):
        # "ﬁ" (U+FB01 LATIN SMALL LIGATURE FI) → "fi" após NFKC.
        out = safe_filename("ﬁle.txt")
        assert out.startswith("fi")

    def test_replaces_accented_chars(self):
        # Acentos não estão na whitelist [A-Za-z0-9._-] — viram `_`.
        out = safe_filename("açaí.jpg")
        # `a` permanece, `ç` e `í` são substituídos por `_`.
        assert re.fullmatch(r"[A-Za-z0-9._-]+", out)
        assert out.endswith(".jpg")

    def test_truncates_to_100_chars(self):
        long = "a" * 500 + ".jpg"
        out = safe_filename(long)
        assert len(out) <= 100

    def test_empty_string_returns_file(self):
        assert safe_filename("") == "file"

    def test_only_invalid_chars_returns_file_or_underscores(self):
        # Após sanitização "/" vira "_" — não vazio, então retorna "_".
        out = safe_filename("/")
        assert out == "_"

    def test_only_dots_returns_file(self):
        # `..` vira `_`, depois lstrip(".") não faz nada porque já não começa com ponto.
        out = safe_filename("...")
        # `..` → `_`, sobra `_.` → após lstrip(".") segue `_.`
        assert out  # não vazio
        assert "/" not in out

    def test_unicode_combining_normalized(self):
        # Forma decomposta (NFD): "e" + U+0301 (combining acute).
        # NFKC recompoe para U+00E9 ("e" precomposto), que NAO esta na
        # whitelist [A-Za-z0-9._-] e por isso vira "_". O ponto deste
        # teste e garantir que NENHUM combining code point solto sobrevive
        # (U+0301 nao pode aparecer no resultado).
        decomposed = "café.jpg"   # e + combining acute
        out = safe_filename(decomposed)
        assert "́" not in out  # U+0301 some apos NFKC + whitelist
        assert out.startswith("caf")  # "caf" sobrevive; "é" -> "e" recompoe -> "_"
        assert out.endswith(".jpg")


# ---------------------------------------------------------------------------
# 2. build_storage_path
# ---------------------------------------------------------------------------


class TestBuildStoragePath:
    def test_format_matches_storage_policy(self):
        tree_id = uuid.uuid4()
        entity_id = uuid.uuid4()
        path = build_storage_path(tree_id, "person", entity_id, "foto.jpg")
        # tree_<uuid>/person/<uuid>/<uuid>-foto.jpg
        pattern = (
            r"^tree_" + str(tree_id) + r"/person/" + str(entity_id)
            + r"/[0-9a-f-]{36}-foto\.jpg$"
        )
        assert re.fullmatch(pattern, path), path

    def test_each_call_uses_fresh_uuid(self):
        tree_id = uuid.uuid4()
        entity_id = uuid.uuid4()
        a = build_storage_path(tree_id, "person", entity_id, "f.jpg")
        b = build_storage_path(tree_id, "person", entity_id, "f.jpg")
        assert a != b

    def test_filename_is_sanitized(self):
        tree_id = uuid.uuid4()
        entity_id = uuid.uuid4()
        path = build_storage_path(tree_id, "person", entity_id, "../etc/passwd")
        assert ".." not in path
        # `/` continua presente apenas como separadores de path canônicos
        # (3 níveis: tree_/, entity_type/, entity_id/).
        assert path.count("/") == 3

    def test_invalid_entity_type_raises_422(self):
        tree_id = uuid.uuid4()
        entity_id = uuid.uuid4()
        with pytest.raises(HTTPException) as exc:
            build_storage_path(tree_id, "hacker", entity_id, "x.jpg")  # type: ignore[arg-type]
        assert exc.value.status_code == 422

    def test_accepts_all_whitelisted_entity_types(self):
        tree_id = uuid.uuid4()
        entity_id = uuid.uuid4()
        for et in ("person", "union", "event", "tree"):
            path = build_storage_path(tree_id, et, entity_id, "f.jpg")  # type: ignore[arg-type]
            assert f"/{et}/" in path


# ---------------------------------------------------------------------------
# 3. HTTP wrappers — mocks via respx
# ---------------------------------------------------------------------------


SUPABASE_BASE = "https://fake.supabase.co"
BUCKET = "stirps-media"


@pytest.mark.anyio
class TestCreateUploadUrl:
    async def test_returns_absolute_url_and_path(self):
        tree_id = uuid.uuid4()
        entity_id = uuid.uuid4()

        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(
                re.compile(rf"^{re.escape(SUPABASE_BASE)}/storage/v1/object/upload/sign/{BUCKET}/.*$")
            ).mock(
                return_value=httpx.Response(
                    200,
                    json={"url": "/object/upload/sign/stirps-media/tree_x/path?token=abc"},
                )
            )

            result = await create_upload_url(tree_id, "person", entity_id, "foto.jpg")

        assert route.called
        assert result["url"].startswith(f"{SUPABASE_BASE}/storage/v1/object/upload/sign/")
        assert "?token=abc" in result["url"]
        assert result["storage_path"].startswith(f"tree_{tree_id}/person/{entity_id}/")
        assert "expires_at" in result

    async def test_500_response_raises_502(self):
        tree_id = uuid.uuid4()
        entity_id = uuid.uuid4()

        with respx.mock() as mock:
            mock.post(
                re.compile(rf"^{re.escape(SUPABASE_BASE)}/storage/v1/object/upload/sign/.*$")
            ).mock(return_value=httpx.Response(500, json={"message": "boom"}))

            with pytest.raises(HTTPException) as exc:
                await create_upload_url(tree_id, "person", entity_id, "foto.jpg")

        assert exc.value.status_code == 502
        assert "boom" in str(exc.value.detail)

    async def test_missing_url_field_raises_502(self):
        tree_id = uuid.uuid4()
        entity_id = uuid.uuid4()

        with respx.mock() as mock:
            mock.post(
                re.compile(rf"^{re.escape(SUPABASE_BASE)}/storage/v1/object/upload/sign/.*$")
            ).mock(return_value=httpx.Response(200, json={}))

            with pytest.raises(HTTPException) as exc:
                await create_upload_url(tree_id, "person", entity_id, "f.jpg")

        assert exc.value.status_code == 502


@pytest.mark.anyio
class TestCreateDownloadUrl:
    async def test_returns_absolute_url_from_signedURL_field(self):
        path = f"tree_{uuid.uuid4()}/person/{uuid.uuid4()}/abc-file.jpg"

        with respx.mock(assert_all_called=True) as mock:
            mock.post(
                f"{SUPABASE_BASE}/storage/v1/object/sign/{BUCKET}/{path}"
            ).mock(
                return_value=httpx.Response(
                    200,
                    json={"signedURL": f"/object/sign/{BUCKET}/{path}?token=xyz"},
                )
            )

            url = await create_download_url(path)

        assert url.startswith(f"{SUPABASE_BASE}/storage/v1/object/sign/{BUCKET}/")
        assert "token=xyz" in url

    async def test_accepts_signedUrl_camel_variant(self):
        """Tolera o casing alternativo `signedUrl` observado em algumas versões."""
        path = "tree_x/person/y/z-f.jpg"

        with respx.mock() as mock:
            mock.post(
                f"{SUPABASE_BASE}/storage/v1/object/sign/{BUCKET}/{path}"
            ).mock(
                return_value=httpx.Response(
                    200,
                    json={"signedUrl": "/object/sign/x/y?token=t"},
                )
            )

            url = await create_download_url(path)

        assert "token=t" in url

    async def test_404_raises_502(self):
        with respx.mock() as mock:
            mock.post(re.compile(rf"^{re.escape(SUPABASE_BASE)}/storage/v1/object/sign/.*$")).mock(
                return_value=httpx.Response(404, json={"message": "not found"})
            )

            with pytest.raises(HTTPException) as exc:
                await create_download_url("tree_x/person/y/z-f.jpg")

        assert exc.value.status_code == 502


@pytest.mark.anyio
class TestDeleteObject:
    async def test_200_returns_none(self):
        path = "tree_x/person/y/z-f.jpg"

        with respx.mock(assert_all_called=True) as mock:
            route = mock.delete(
                f"{SUPABASE_BASE}/storage/v1/object/{BUCKET}/{path}"
            ).mock(return_value=httpx.Response(200, json={"message": "ok"}))

            result = await delete_object(path)

        assert result is None
        assert route.called

    async def test_403_raises_502(self):
        path = "tree_x/person/y/z-f.jpg"

        with respx.mock() as mock:
            mock.delete(
                f"{SUPABASE_BASE}/storage/v1/object/{BUCKET}/{path}"
            ).mock(return_value=httpx.Response(403, json={"message": "denied"}))

            with pytest.raises(HTTPException) as exc:
                await delete_object(path)

        assert exc.value.status_code == 502
        assert "denied" in str(exc.value.detail)


# ---------------------------------------------------------------------------
# 4. Headers + base URL — sanity check de configuração
# ---------------------------------------------------------------------------


@pytest.mark.anyio
class TestHeadersAndBaseUrl:
    async def test_authorization_header_uses_service_role_key(self):
        tree_id = uuid.uuid4()
        entity_id = uuid.uuid4()

        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(
                re.compile(rf"^{re.escape(SUPABASE_BASE)}/storage/v1/object/upload/sign/.*$")
            ).mock(
                return_value=httpx.Response(200, json={"url": "/object/upload/sign/x?token=t"})
            )

            await create_upload_url(tree_id, "person", entity_id, "f.jpg")

        request = route.calls[0].request
        assert request.headers["Authorization"] == "Bearer service-role-test"

    async def test_missing_service_key_raises_500(self, monkeypatch):
        get_settings.cache_clear()
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "")
        try:
            with pytest.raises(HTTPException) as exc:
                await create_upload_url(uuid.uuid4(), "person", uuid.uuid4(), "f.jpg")
            assert exc.value.status_code == 500
        finally:
            get_settings.cache_clear()
