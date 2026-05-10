"""
test_auth.py — fluxo de autenticação contra o app real (Issue #10).

Valida:
  - 401 sem header Authorization.
  - 401 com JWT inválido (assinatura quebrada).
  - GET /api/me retorna o profile do usuário autenticado.

Requer banco com migrations aplicadas — pulado se TEST_DATABASE_URL ausente.
"""
from __future__ import annotations

import os

import jwt
import pytest

pytestmark = pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL") or not os.getenv("SUPABASE_JWT_SECRET"),
    reason="TEST_DATABASE_URL e SUPABASE_JWT_SECRET necessários",
)


@pytest.mark.anyio
async def test_me_without_authorization_returns_401(client):
    async with client() as c:
        resp = await c.get("/api/me")
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_me_with_invalid_jwt_returns_401(client):
    """JWT assinado com segredo errado → InvalidTokenError → 401."""
    bad = jwt.encode({"sub": "not-a-uuid"}, "wrong-secret", algorithm="HS256")
    async with client(token=bad) as c:
        resp = await c.get("/api/me")
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_me_returns_profile_for_authenticated_user(client, make_user):
    uid, token = make_user(display_name="Alice no Auth")
    async with client(token=token) as c:
        resp = await c.get("/api/me")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["profile"]["id"] == str(uid)
    assert body["profile"]["display_name"] == "Alice no Auth"
    # Usuário recém-criado não tem árvores ainda.
    assert body["trees"] == []


@pytest.mark.anyio
async def test_me_includes_owned_tree_after_create(client, make_user):
    """POST /api/trees → owner aparece em GET /api/me com role='owner'."""
    _uid, token = make_user(display_name="Tree Owner")
    async with client(token=token) as c:
        create = await c.post("/api/trees", json={"name": "Árvore Teste"})
        assert create.status_code == 201, create.text
        me = await c.get("/api/me")
    assert me.status_code == 200
    body = me.json()
    assert len(body["trees"]) == 1
    assert body["trees"][0]["role"] == "owner"
    assert body["trees"][0]["tree"]["name"] == "Árvore Teste"
