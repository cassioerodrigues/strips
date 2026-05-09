"""
test_routers_unions_events.py — smoke tests para os routers de uniões e eventos.

Sem banco real: valida apenas:
  1. Endpoints estão montados nos paths esperados.
  2. Sem Authorization → 401 em todos os endpoints autenticados.
  3. UUID inválidos em path params → 422.
  4. Payload inválido em POST → 422 (EventCreate sem person_id nem union_id).

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
UNION_ID = uuid.uuid4()
EVENT_ID = uuid.uuid4()
PERSON_A = uuid.uuid4()
PERSON_B = uuid.uuid4()


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

    # Unions
    def test_list_unions_is_registered(self, app):
        assert "/api/trees/{tree_id}/unions" in self._paths(app)

    def test_create_union_is_registered(self, app):
        assert "/api/trees/{tree_id}/unions" in self._paths(app)

    def test_patch_union_is_registered(self, app):
        assert "/api/unions/{union_id}" in self._paths(app)

    def test_delete_union_is_registered(self, app):
        assert "/api/unions/{union_id}" in self._paths(app)

    # Events
    def test_list_events_is_registered(self, app):
        assert "/api/trees/{tree_id}/events" in self._paths(app)

    def test_create_event_is_registered(self, app):
        assert "/api/trees/{tree_id}/events" in self._paths(app)

    def test_patch_event_is_registered(self, app):
        assert "/api/events/{event_id}" in self._paths(app)

    def test_delete_event_is_registered(self, app):
        assert "/api/events/{event_id}" in self._paths(app)


# ---------------------------------------------------------------------------
# 2. Sem token → 401
# ---------------------------------------------------------------------------


@pytest.mark.anyio
class TestUnauthorizedReturns401:
    async def test_list_unions_no_token(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.get(f"/api/trees/{TREE_ID}/unions")
        assert r.status_code == 401

    async def test_create_union_no_token(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.post(f"/api/trees/{TREE_ID}/unions", json={})
        assert r.status_code == 401

    async def test_patch_union_no_token(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.patch(f"/api/unions/{UNION_ID}", json={})
        assert r.status_code == 401

    async def test_delete_union_no_token(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.delete(f"/api/unions/{UNION_ID}")
        assert r.status_code == 401

    async def test_list_events_no_token(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.get(f"/api/trees/{TREE_ID}/events")
        assert r.status_code == 401

    async def test_create_event_no_token(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.post(f"/api/trees/{TREE_ID}/events", json={})
        assert r.status_code == 401

    async def test_patch_event_no_token(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.patch(f"/api/events/{EVENT_ID}", json={})
        assert r.status_code == 401

    async def test_delete_event_no_token(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.delete(f"/api/events/{EVENT_ID}")
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# 3. UUID inválidos em path params → 422
# ---------------------------------------------------------------------------


@pytest.mark.anyio
class TestPathParamValidation:
    async def test_list_unions_bad_tree_uuid(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.get("/api/trees/nao-e-uuid/unions")
        assert r.status_code == 422

    async def test_patch_union_bad_uuid(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.patch("/api/unions/nao-e-uuid", json={})
        assert r.status_code == 422

    async def test_delete_union_bad_uuid(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.delete("/api/unions/nao-e-uuid")
        assert r.status_code == 422

    async def test_list_events_bad_tree_uuid(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.get("/api/trees/nao-e-uuid/events")
        assert r.status_code == 422

    async def test_patch_event_bad_uuid(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.patch("/api/events/nao-e-uuid", json={})
        assert r.status_code == 422

    async def test_delete_event_bad_uuid(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.delete("/api/events/nao-e-uuid")
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# 4. Payload inválido em POST → 422
# ---------------------------------------------------------------------------


@pytest.mark.anyio
class TestPayloadValidation:
    async def test_create_event_without_person_or_union_returns_422(self, authed_app):
        """POST /events sem person_id nem union_id → 422 (validação Pydantic)."""
        payload = {
            "tree_id": str(TREE_ID),
            "type": "baptism",
            # person_id e union_id ausentes — deve falhar
        }
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.post(f"/api/trees/{TREE_ID}/events", json=payload)
        assert r.status_code == 422

    async def test_create_union_missing_required_fields_returns_422(self, authed_app):
        """POST /unions sem partner_a_id/partner_b_id → 422."""
        payload = {"type": "marriage"}
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.post(f"/api/trees/{TREE_ID}/unions", json=payload)
        assert r.status_code == 422

    async def test_create_union_invalid_type_returns_422(self, authed_app):
        """POST /unions com type inválido → 422."""
        payload = {
            "tree_id": str(TREE_ID),
            "partner_a_id": str(PERSON_A),
            "partner_b_id": str(PERSON_B),
            "type": "invalid_union_type",
        }
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.post(f"/api/trees/{TREE_ID}/unions", json=payload)
        assert r.status_code == 422

    async def test_create_event_invalid_type_returns_422(self, authed_app):
        """POST /events com type inválido → 422."""
        payload = {
            "tree_id": str(TREE_ID),
            "type": "tipo_inventado",
            "person_id": str(PERSON_A),
        }
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.post(f"/api/trees/{TREE_ID}/events", json=payload)
        assert r.status_code == 422
