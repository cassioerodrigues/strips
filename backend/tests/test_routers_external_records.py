"""
test_routers_external_records.py — smoke tests para o router de external_records.

Sem banco real: valida apenas:
  1. Endpoints estão montados nos paths esperados.
  2. Sem Authorization → 401 em todos os endpoints autenticados.
  3. UUID inválidos em path params → 422.
  4. Validação de payload (Pydantic) em POST/PATCH → 422.

Testes com banco real + RLS estão em test_external_records.py.
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
RECORD_ID = uuid.uuid4()
PERSON_ID = uuid.uuid4()


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

    def test_list_external_records_is_registered(self, app):
        assert "/api/trees/{tree_id}/external-records" in self._paths(app)

    def test_create_external_record_is_registered(self, app):
        assert "/api/trees/{tree_id}/external-records" in self._paths(app)

    def test_patch_external_record_is_registered(self, app):
        assert "/api/external-records/{record_id}" in self._paths(app)

    def test_delete_external_record_is_registered(self, app):
        assert "/api/external-records/{record_id}" in self._paths(app)


# ---------------------------------------------------------------------------
# 2. Sem token → 401
# ---------------------------------------------------------------------------


@pytest.mark.anyio
class TestUnauthorizedReturns401:
    async def test_list_no_token(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.get(f"/api/trees/{TREE_ID}/external-records")
        assert r.status_code == 401

    async def test_create_no_token(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.post(
                f"/api/trees/{TREE_ID}/external-records",
                json={"source": "familysearch"},
            )
        assert r.status_code == 401

    async def test_patch_no_token(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.patch(f"/api/external-records/{RECORD_ID}", json={})
        assert r.status_code == 401

    async def test_delete_no_token(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.delete(f"/api/external-records/{RECORD_ID}")
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# 3. UUID inválidos em path params → 422
# ---------------------------------------------------------------------------


@pytest.mark.anyio
class TestPathParamValidation:
    async def test_list_bad_tree_uuid(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.get("/api/trees/nao-e-uuid/external-records")
        assert r.status_code == 422

    async def test_patch_bad_uuid(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.patch("/api/external-records/nao-e-uuid", json={})
        assert r.status_code == 422

    async def test_delete_bad_uuid(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.delete("/api/external-records/nao-e-uuid")
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# 4. Validação de payload Pydantic → 422
# ---------------------------------------------------------------------------


@pytest.mark.anyio
class TestPayloadValidation:
    async def test_create_missing_source_returns_422(self, authed_app):
        """POST sem `source` → 422 (campo obrigatório)."""
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.post(
                f"/api/trees/{TREE_ID}/external-records",
                json={"title": "Random"},
            )
        assert r.status_code == 422

    async def test_create_empty_source_returns_422(self, authed_app):
        """POST com `source` vazio → 422 (min_length=1)."""
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.post(
                f"/api/trees/{TREE_ID}/external-records",
                json={"source": ""},
            )
        assert r.status_code == 422

    async def test_create_confidence_out_of_range_returns_422(self, authed_app):
        """POST com confidence > 100 → 422 (le=100)."""
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.post(
                f"/api/trees/{TREE_ID}/external-records",
                json={"source": "familysearch", "confidence": 150},
            )
        assert r.status_code == 422

    async def test_create_confidence_negative_returns_422(self, authed_app):
        """POST com confidence < 0 → 422 (ge=0)."""
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.post(
                f"/api/trees/{TREE_ID}/external-records",
                json={"source": "familysearch", "confidence": -1},
            )
        assert r.status_code == 422

    async def test_create_invalid_status_returns_422(self, authed_app):
        """POST com status fora do enum → 422."""
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.post(
                f"/api/trees/{TREE_ID}/external-records",
                json={"source": "familysearch", "status": "pending"},
            )
        assert r.status_code == 422

    async def test_patch_invalid_status_returns_422(self, authed_app):
        """PATCH com status fora do enum → 422."""
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.patch(
                f"/api/external-records/{RECORD_ID}",
                json={"status": "approved"},  # valor fora do enum
            )
        assert r.status_code == 422

    async def test_list_invalid_status_returns_422(self, authed_app):
        """GET ?status=foo → 422 (Literal valida)."""
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.get(f"/api/trees/{TREE_ID}/external-records?status=foo")
        assert r.status_code == 422

    async def test_list_limit_too_high_returns_422(self, authed_app):
        """GET com limit > 200 → 422."""
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.get(f"/api/trees/{TREE_ID}/external-records?limit=500")
        assert r.status_code == 422
