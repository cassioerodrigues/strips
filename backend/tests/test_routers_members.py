"""
test_routers_members.py — smoke tests para o router /api/trees/{tree_id}/members.

Sem banco real: valida apenas:
  1. Endpoints estão montados nos paths esperados.
  2. Sem Authorization → 401 em todos os endpoints autenticados.
  3. UUID inválidos em path params → 422.
  4. Payload inválido em POST/PATCH → 422.

Testes integrados com banco real + RLS estão em test_members.py
(gated por TEST_DATABASE_URL).
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
USER_ID = uuid.uuid4()


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

    def test_list_members_is_registered(self, app):
        assert "/api/trees/{tree_id}/members" in self._paths(app)

    def test_invite_member_is_registered(self, app):
        # Mesmo path com POST — basta confirmar uma vez.
        assert "/api/trees/{tree_id}/members" in self._paths(app)

    def test_update_member_is_registered(self, app):
        assert "/api/trees/{tree_id}/members/{user_id}" in self._paths(app)

    def test_delete_member_is_registered(self, app):
        assert "/api/trees/{tree_id}/members/{user_id}" in self._paths(app)


# ---------------------------------------------------------------------------
# 2. Endpoints autenticados retornam 401 sem token
# ---------------------------------------------------------------------------


@pytest.mark.anyio
class TestUnauthorizedReturns401:
    async def test_list_members_without_token(self, app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get(f"/api/trees/{TREE_ID}/members")
        assert resp.status_code == 401

    async def test_invite_member_without_token(self, app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                f"/api/trees/{TREE_ID}/members",
                json={"email": "x@y.com", "role": "viewer"},
            )
        assert resp.status_code == 401

    async def test_update_member_without_token(self, app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.patch(
                f"/api/trees/{TREE_ID}/members/{USER_ID}",
                json={"role": "editor"},
            )
        assert resp.status_code == 401

    async def test_delete_member_without_token(self, app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.delete(f"/api/trees/{TREE_ID}/members/{USER_ID}")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# 3. Validação de payload / path params (FastAPI 422 antes do service)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
class TestPayloadValidation:
    async def test_invite_empty_body_is_422(self, authed_app):
        async with AsyncClient(
            transport=ASGITransport(app=authed_app), base_url="http://test"
        ) as client:
            resp = await client.post(f"/api/trees/{TREE_ID}/members", json={})
        assert resp.status_code == 422

    async def test_invite_invalid_email_is_422(self, authed_app):
        async with AsyncClient(
            transport=ASGITransport(app=authed_app), base_url="http://test"
        ) as client:
            resp = await client.post(
                f"/api/trees/{TREE_ID}/members",
                json={"email": "not-an-email", "role": "viewer"},
            )
        assert resp.status_code == 422

    async def test_invite_role_owner_is_422(self, authed_app):
        """Inviting as 'owner' não passa no Literal['editor','viewer']."""
        async with AsyncClient(
            transport=ASGITransport(app=authed_app), base_url="http://test"
        ) as client:
            resp = await client.post(
                f"/api/trees/{TREE_ID}/members",
                json={"email": "x@y.com", "role": "owner"},
            )
        assert resp.status_code == 422

    async def test_invite_invalid_role_is_422(self, authed_app):
        async with AsyncClient(
            transport=ASGITransport(app=authed_app), base_url="http://test"
        ) as client:
            resp = await client.post(
                f"/api/trees/{TREE_ID}/members",
                json={"email": "x@y.com", "role": "admin"},
            )
        assert resp.status_code == 422

    async def test_patch_role_owner_is_422(self, authed_app):
        """PATCH role='owner' bloqueado pelo Literal."""
        async with AsyncClient(
            transport=ASGITransport(app=authed_app), base_url="http://test"
        ) as client:
            resp = await client.patch(
                f"/api/trees/{TREE_ID}/members/{USER_ID}",
                json={"role": "owner"},
            )
        assert resp.status_code == 422

    async def test_list_with_invalid_tree_uuid_is_422(self, authed_app):
        async with AsyncClient(
            transport=ASGITransport(app=authed_app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/trees/nao-e-uuid/members")
        assert resp.status_code == 422

    async def test_patch_with_invalid_user_uuid_is_422(self, authed_app):
        async with AsyncClient(
            transport=ASGITransport(app=authed_app), base_url="http://test"
        ) as client:
            resp = await client.patch(
                f"/api/trees/{TREE_ID}/members/nao-e-uuid",
                json={"role": "editor"},
            )
        assert resp.status_code == 422
