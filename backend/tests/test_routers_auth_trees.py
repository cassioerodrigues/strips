"""
test_routers_auth_trees.py — smoke tests para os routers /api/me e /api/trees.

Sem banco real: valida apenas:
  1. Endpoints estão montados nos paths esperados.
  2. Sem Authorization → 401 em todos os endpoints autenticados.
  3. MeResponse valida com fixture mockada.

Testes com banco real + RLS são escopo da Issue #10.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app
from app.schemas.auth import MeResponse, ProfileOut, SubscriptionOut, TreeMembershipOut
from app.schemas.tree import TreeOut


# ---------------------------------------------------------------------------
# App fixture
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def app():
    return create_app()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

NOW = datetime(2024, 1, 1, tzinfo=timezone.utc)
USER_ID = uuid.uuid4()
TREE_ID = uuid.uuid4()


def _make_tree_out() -> TreeOut:
    return TreeOut(
        id=TREE_ID,
        owner_id=USER_ID,
        name="Família Teste",
        description="Árvore de smoke test",
        created_at=NOW,
        updated_at=NOW,
    )


def _make_profile_out() -> ProfileOut:
    return ProfileOut(
        id=USER_ID,
        display_name="Usuário Teste",
        avatar_url=None,
        locale="pt-BR",
        created_at=NOW,
        updated_at=NOW,
    )


def _make_subscription_out() -> SubscriptionOut:
    return SubscriptionOut(code="free", name="Gratis", collaborator_limit=0)


# ---------------------------------------------------------------------------
# 1. Rotas montadas corretamente
# ---------------------------------------------------------------------------


class TestRoutesMounted:
    def test_api_me_is_registered(self, app):
        """GET /api/me deve estar registrado no app."""
        paths = [r.path for r in app.routes]
        assert "/api/me" in paths, f"/api/me não encontrado em {paths}"

    def test_api_trees_is_registered(self, app):
        """GET /api/trees deve estar registrado no app."""
        paths = [r.path for r in app.routes]
        assert "/api/trees" in paths, f"/api/trees não encontrado em {paths}"

    def test_api_trees_detail_is_registered(self, app):
        """GET /api/trees/{tree_id} deve estar registrado no app."""
        paths = [r.path for r in app.routes]
        assert "/api/trees/{tree_id}" in paths, f"/api/trees/{{tree_id}} não encontrado em {paths}"

    def test_whoami_is_removed(self, app):
        """GET /api/_whoami deve ter sido removido."""
        paths = [r.path for r in app.routes]
        assert "/api/_whoami" not in paths, "/api/_whoami ainda presente — deveria ter sido removido"


# ---------------------------------------------------------------------------
# 2. Endpoints autenticados retornam 401 sem token
# ---------------------------------------------------------------------------


@pytest.mark.anyio
class TestUnauthorizedReturns401:
    async def test_me_without_token(self, app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/me")
        assert resp.status_code == 401

    async def test_list_trees_without_token(self, app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/trees")
        assert resp.status_code == 401

    async def test_create_tree_without_token(self, app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/api/trees", json={"name": "Teste"})
        assert resp.status_code == 401

    async def test_get_tree_without_token(self, app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get(f"/api/trees/{TREE_ID}")
        assert resp.status_code == 401

    async def test_patch_tree_without_token(self, app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.patch(f"/api/trees/{TREE_ID}", json={"name": "Novo"})
        assert resp.status_code == 401

    async def test_delete_tree_without_token(self, app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.delete(f"/api/trees/{TREE_ID}")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# 2b. Validação de payload / path params (FastAPI 422 antes de tocar service)
# ---------------------------------------------------------------------------


@pytest.fixture
def authed_app(app):
    """App com auth bypass — para testar validação de payload/path sem JWT real."""
    from app.deps import get_current_user, get_db_authenticated
    from app.auth import Claims

    fake_user = Claims(sub=USER_ID, email="t@t", role="authenticated")
    app.dependency_overrides[get_current_user] = lambda: fake_user
    # get_db_authenticated não pode ser executado de fato (não há pool); o teste
    # só precisa que a validação de payload/path rode antes do service.
    app.dependency_overrides[get_db_authenticated] = lambda: None
    yield app
    app.dependency_overrides.clear()


@pytest.mark.anyio
class TestPayloadValidation:
    async def test_create_tree_empty_body_is_422(self, authed_app):
        async with AsyncClient(
            transport=ASGITransport(app=authed_app), base_url="http://test"
        ) as client:
            resp = await client.post("/api/trees", json={})
        assert resp.status_code == 422

    async def test_get_tree_with_invalid_uuid_is_422(self, authed_app):
        async with AsyncClient(
            transport=ASGITransport(app=authed_app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/trees/nao-e-uuid")
        assert resp.status_code == 422

    async def test_patch_tree_with_invalid_uuid_is_422(self, authed_app):
        async with AsyncClient(
            transport=ASGITransport(app=authed_app), base_url="http://test"
        ) as client:
            resp = await client.patch("/api/trees/nao-e-uuid", json={"name": "x"})
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# 3. MeResponse valida com fixture mockada
# ---------------------------------------------------------------------------


class TestMeResponseSchema:
    def test_me_response_full(self):
        """MeResponse aceita profile + lista de memberships."""
        profile = _make_profile_out()
        tree = _make_tree_out()
        membership = TreeMembershipOut(tree=tree, role="owner", joined_at=NOW)
        me = MeResponse(profile=profile, trees=[membership], subscription=_make_subscription_out())

        assert me.profile.display_name == "Usuário Teste"
        assert len(me.trees) == 1
        assert me.trees[0].role == "owner"
        assert me.trees[0].tree.name == "Família Teste"
        assert me.subscription.code == "free"

    def test_me_response_empty_trees(self):
        """MeResponse com trees=[] é válido."""
        profile = _make_profile_out()
        me = MeResponse(profile=profile, trees=[], subscription=_make_subscription_out())
        assert me.trees == []

    def test_me_response_json_roundtrip(self):
        """MeResponse serializa e desserializa sem perda."""
        profile = _make_profile_out()
        tree = _make_tree_out()
        membership = TreeMembershipOut(tree=tree, role="editor", joined_at=NOW)
        me = MeResponse(profile=profile, trees=[membership], subscription=_make_subscription_out())

        json_str = me.model_dump_json()
        me2 = MeResponse.model_validate_json(json_str)
        assert me2.profile.id == USER_ID
        assert me2.trees[0].role == "editor"
