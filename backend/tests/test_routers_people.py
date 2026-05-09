"""
test_routers_people.py — smoke tests para os routers /api/trees/.../people e /api/people.

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
PERSON_ID = uuid.uuid4()
MEDIA_ID = uuid.uuid4()


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

    def test_list_people_is_registered(self, app):
        assert "/api/trees/{tree_id}/people" in self._paths(app)

    def test_create_person_is_registered(self, app):
        paths = self._paths(app)
        assert "/api/trees/{tree_id}/people" in paths

    def test_get_person_is_registered(self, app):
        assert "/api/people/{person_id}" in self._paths(app)

    def test_patch_person_is_registered(self, app):
        assert "/api/people/{person_id}" in self._paths(app)

    def test_delete_person_is_registered(self, app):
        assert "/api/people/{person_id}" in self._paths(app)

    def test_relations_is_registered(self, app):
        assert "/api/people/{person_id}/relations" in self._paths(app)

    def test_events_is_registered(self, app):
        assert "/api/people/{person_id}/events" in self._paths(app)

    def test_media_list_is_registered(self, app):
        assert "/api/people/{person_id}/media" in self._paths(app)

    def test_media_link_is_registered(self, app):
        assert "/api/people/{person_id}/media/{media_id}" in self._paths(app)

    def test_parents_add_is_registered(self, app):
        assert "/api/people/{child_id}/parents" in self._paths(app)

    def test_parents_remove_is_registered(self, app):
        assert "/api/people/{child_id}/parents/{parent_id}" in self._paths(app)


# ---------------------------------------------------------------------------
# 2. Sem token → 401
# ---------------------------------------------------------------------------


@pytest.mark.anyio
class TestUnauthorizedReturns401:
    async def test_list_people_no_token(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.get(f"/api/trees/{TREE_ID}/people")
        assert r.status_code == 401

    async def test_create_person_no_token(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.post(f"/api/trees/{TREE_ID}/people", json={})
        assert r.status_code == 401

    async def test_get_person_no_token(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.get(f"/api/people/{PERSON_ID}")
        assert r.status_code == 401

    async def test_patch_person_no_token(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.patch(f"/api/people/{PERSON_ID}", json={"first_name": "X"})
        assert r.status_code == 401

    async def test_delete_person_no_token(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.delete(f"/api/people/{PERSON_ID}")
        assert r.status_code == 401

    async def test_relations_no_token(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.get(f"/api/people/{PERSON_ID}/relations")
        assert r.status_code == 401

    async def test_events_no_token(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.get(f"/api/people/{PERSON_ID}/events")
        assert r.status_code == 401

    async def test_media_no_token(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.get(f"/api/people/{PERSON_ID}/media")
        assert r.status_code == 401

    async def test_link_media_no_token(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.post(f"/api/people/{PERSON_ID}/media/{MEDIA_ID}")
        assert r.status_code == 401

    async def test_unlink_media_no_token(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.delete(f"/api/people/{PERSON_ID}/media/{MEDIA_ID}")
        assert r.status_code == 401

    async def test_add_parent_no_token(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.post(f"/api/people/{PERSON_ID}/parents", json={})
        assert r.status_code == 401

    async def test_remove_parent_no_token(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.delete(f"/api/people/{PERSON_ID}/parents/{PERSON_ID}")
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# 3. UUID inválidos em path params → 422
# ---------------------------------------------------------------------------


@pytest.mark.anyio
class TestPathParamValidation:
    async def test_list_people_bad_tree_uuid(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.get("/api/trees/nao-e-uuid/people")
        assert r.status_code == 422

    async def test_get_person_bad_uuid(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.get("/api/people/nao-e-uuid")
        assert r.status_code == 422

    async def test_patch_person_bad_uuid(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.patch("/api/people/nao-e-uuid", json={})
        assert r.status_code == 422

    async def test_delete_person_bad_uuid(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.delete("/api/people/nao-e-uuid")
        assert r.status_code == 422

    async def test_relations_bad_uuid(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.get("/api/people/nao-e-uuid/relations")
        assert r.status_code == 422

    async def test_events_bad_uuid(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.get("/api/people/nao-e-uuid/events")
        assert r.status_code == 422

    async def test_media_bad_uuid(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.get("/api/people/nao-e-uuid/media")
        assert r.status_code == 422

    async def test_add_parent_bad_child_uuid(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.post(
                "/api/people/nao-e-uuid/parents",
                json={"child_id": str(PERSON_ID), "parent_id": str(PERSON_ID), "kind": "biological"},
            )
        assert r.status_code == 422

    async def test_remove_parent_bad_uuids(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.delete("/api/people/nao-e-uuid/parents/nao-e-uuid")
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# 4. Query param inválido → 422
# ---------------------------------------------------------------------------


@pytest.mark.anyio
class TestQueryParamValidation:
    async def test_sort_invalid_value(self, authed_app):
        """sort= com valor fora da whitelist deve retornar 422."""
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.get(f"/api/trees/{TREE_ID}/people?sort=injecao_sql")
        assert r.status_code == 422

    async def test_limit_too_large(self, authed_app):
        """limit > 200 deve retornar 422."""
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.get(f"/api/trees/{TREE_ID}/people?limit=999")
        assert r.status_code == 422

    async def test_offset_negative(self, authed_app):
        """offset < 0 deve retornar 422."""
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.get(f"/api/trees/{TREE_ID}/people?offset=-1")
        assert r.status_code == 422
