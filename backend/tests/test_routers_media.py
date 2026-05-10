"""
test_routers_media.py — smoke tests para o router /api/.../media.

Sem banco real: valida apenas:
  1. Endpoints estão montados nos paths esperados.
  2. Sem Authorization → 401 em todos os endpoints autenticados.
  3. UUID inválidos em path params → 422.
  4. Payload inválido em POST → 422.

Testes com banco real + RLS são escopo da Issue #10.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

TREE_ID = uuid.uuid4()
MEDIA_ID = uuid.uuid4()
ENTITY_ID = uuid.uuid4()


@pytest.fixture(scope="module")
def app():
    return create_app()


@pytest.fixture
def authed_app(app):
    """App com auth bypass — para testar validação de payload/path sem JWT real."""
    from app.auth import Claims
    from app.deps import get_current_user, get_db_authenticated

    fake_user = Claims(sub=uuid.uuid4(), email="t@t.com", role="authenticated")
    app.dependency_overrides[get_current_user] = lambda: fake_user
    app.dependency_overrides[get_db_authenticated] = lambda: None
    yield app
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# 1. Rotas montadas corretamente
# ---------------------------------------------------------------------------


class TestRoutesMounted:
    def _paths(self, app) -> list[str]:
        return [r.path for r in app.routes]

    def test_upload_url_is_registered(self, app):
        assert "/api/trees/{tree_id}/media/upload-url" in self._paths(app)

    def test_create_media_is_registered(self, app):
        assert "/api/trees/{tree_id}/media" in self._paths(app)

    def test_download_url_is_registered(self, app):
        assert "/api/media/{media_id}/download-url" in self._paths(app)

    def test_delete_media_is_registered(self, app):
        assert "/api/media/{media_id}" in self._paths(app)


# ---------------------------------------------------------------------------
# 2. Sem token → 401
# ---------------------------------------------------------------------------


@pytest.mark.anyio
class TestUnauthorizedReturns401:
    async def test_upload_url_no_token(self, app):
        body = {
            "filename": "foto.jpg",
            "mime_type": "image/jpeg",
            "entity_type": "person",
            "entity_id": str(ENTITY_ID),
        }
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.post(f"/api/trees/{TREE_ID}/media/upload-url", json=body)
        assert r.status_code == 401

    async def test_create_media_no_token(self, app):
        body = {
            "tree_id": str(TREE_ID),
            "kind": "photo",
            "storage_path": f"tree_{TREE_ID}/person/{ENTITY_ID}/abc-foto.jpg",
        }
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.post(f"/api/trees/{TREE_ID}/media", json=body)
        assert r.status_code == 401

    async def test_download_url_no_token(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.get(f"/api/media/{MEDIA_ID}/download-url")
        assert r.status_code == 401

    async def test_delete_media_no_token(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.delete(f"/api/media/{MEDIA_ID}")
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# 3. UUID inválidos em path params → 422
# ---------------------------------------------------------------------------


@pytest.mark.anyio
class TestPathParamValidation:
    async def test_upload_url_bad_tree_uuid(self, authed_app):
        body = {
            "filename": "f.jpg",
            "mime_type": "image/jpeg",
            "entity_type": "person",
            "entity_id": str(ENTITY_ID),
        }
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.post("/api/trees/nao-e-uuid/media/upload-url", json=body)
        assert r.status_code == 422

    async def test_create_media_bad_tree_uuid(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.post(
                "/api/trees/nao-e-uuid/media",
                json={"tree_id": str(TREE_ID), "kind": "photo", "storage_path": "x"},
            )
        assert r.status_code == 422

    async def test_download_url_bad_media_uuid(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.get("/api/media/nao-e-uuid/download-url")
        assert r.status_code == 422

    async def test_delete_media_bad_uuid(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.delete("/api/media/nao-e-uuid")
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# 4. Payload inválido em POST → 422
# ---------------------------------------------------------------------------


@pytest.mark.anyio
class TestPayloadValidation:
    async def test_upload_url_missing_fields(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.post(f"/api/trees/{TREE_ID}/media/upload-url", json={})
        assert r.status_code == 422

    async def test_upload_url_missing_filename(self, authed_app):
        body = {
            # filename ausente
            "mime_type": "image/jpeg",
            "entity_type": "person",
            "entity_id": str(ENTITY_ID),
        }
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.post(f"/api/trees/{TREE_ID}/media/upload-url", json=body)
        assert r.status_code == 422

    async def test_upload_url_invalid_entity_uuid(self, authed_app):
        body = {
            "filename": "f.jpg",
            "mime_type": "image/jpeg",
            "entity_type": "person",
            "entity_id": "not-a-uuid",
        }
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.post(f"/api/trees/{TREE_ID}/media/upload-url", json=body)
        assert r.status_code == 422

    async def test_create_media_missing_required(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.post(f"/api/trees/{TREE_ID}/media", json={})
        assert r.status_code == 422

    async def test_create_media_invalid_kind(self, authed_app):
        body = {
            "tree_id": str(TREE_ID),
            "kind": "tipo_inventado",  # fora do Literal media_kind_t
            "storage_path": f"tree_{TREE_ID}/person/{ENTITY_ID}/abc-foto.jpg",
        }
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.post(f"/api/trees/{TREE_ID}/media", json=body)
        assert r.status_code == 422

    async def test_create_media_storage_path_cross_tenant(self, authed_app):
        """storage_path apontando para outra tree -> 422 (cross-tenant)."""
        other_tree = uuid.uuid4()
        body = {
            "tree_id": str(TREE_ID),
            "kind": "photo",
            # storage_path aponta para tree_<other_tree>, nao a do body.
            "storage_path": f"tree_{other_tree}/person/{ENTITY_ID}/abc-target.jpg",
        }
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.post(f"/api/trees/{TREE_ID}/media", json=body)
        assert r.status_code == 422
        # Defensivo: mensagem deve mencionar storage_path/tree_id
        assert "storage_path" in r.text

    async def test_create_media_storage_path_malformed_no_prefix(self, authed_app):
        """storage_path sem prefixo tree_ -> 422."""
        body = {
            "tree_id": str(TREE_ID),
            "kind": "photo",
            "storage_path": f"person/{ENTITY_ID}/abc-foto.jpg",  # falta tree_<id>/
        }
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.post(f"/api/trees/{TREE_ID}/media", json=body)
        assert r.status_code == 422

    async def test_create_media_storage_path_invalid_entity_type(self, authed_app):
        """storage_path com entity_type fora da whitelist -> 422 (defesa em profundidade)."""
        body = {
            "tree_id": str(TREE_ID),
            "kind": "photo",
            # 'hacker' nao e um EntityType valido (person/union/event/tree).
            "storage_path": f"tree_{TREE_ID}/hacker/{ENTITY_ID}/abc-x.jpg",
        }
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.post(f"/api/trees/{TREE_ID}/media", json=body)
        assert r.status_code == 422

    async def test_create_media_tree_id_body_diverges_from_path(self, authed_app):
        """tree_id no body diverge do path -> 422 (router check)."""
        other_tree = uuid.uuid4()
        # storage_path consistente com other_tree para nao bater no validator
        # de schema antes — assim testamos especificamente o check do router.
        body = {
            "tree_id": str(other_tree),
            "kind": "photo",
            "storage_path": f"tree_{other_tree}/person/{ENTITY_ID}/abc-foto.jpg",
        }
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.post(f"/api/trees/{TREE_ID}/media", json=body)
        assert r.status_code == 422

    async def test_upload_url_invalid_entity_type(self, authed_app):
        """entity_type fora do Literal -> 422 antes de tocar o banco."""
        body = {
            "filename": "f.jpg",
            "mime_type": "image/jpeg",
            "entity_type": "hacker",  # nao esta em person/union/event/tree
            "entity_id": str(ENTITY_ID),
        }
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.post(f"/api/trees/{TREE_ID}/media/upload-url", json=body)
        assert r.status_code == 422
