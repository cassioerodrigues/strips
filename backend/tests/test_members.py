"""
test_members.py — testes integrados dos endpoints de tree_members (Issue #13).

Cobertura dos critérios de aceite da issue:

  - POST como editor → 403 (RLS bloqueia, owner-only).
  - Owner adiciona viewer → viewer faz GET /members → 200 com lista.
    Viewer tenta POST /members → 403.
  - Lookup por email inexistente → 404 com mensagem clara.
  - Owner remove a si mesmo → 400.
  - GET /api/me continua devolvendo todas as árvores onde o usuário é membro.

Plus testes auxiliares: PATCH demote self → 400; PATCH/PROMOTE owner → 422;
DELETE de membro inexistente → 404; POST duplicado → 409.

Pulado quando TEST_DATABASE_URL ausente — ver README.
"""
from __future__ import annotations

import os
import uuid

import pytest

pytestmark = pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"),
    reason="TEST_DATABASE_URL necessário",
)


# ---------------------------------------------------------------------------
# Helper: cria um usuário sem membership e devolve email — necessário para o
# fluxo de invite (que resolve email → user_id internamente).
# ---------------------------------------------------------------------------


def _user_email(db_pool, user_id: uuid.UUID) -> str:
    with db_pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT email FROM auth.users WHERE id = %s", (user_id,))
            row = cur.fetchone()
    assert row is not None
    return row[0]


# ---------------------------------------------------------------------------
# GET /members — owner lista a si próprio
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_owner_lists_self_as_only_member(client, seeded_tree):
    token_a = seeded_tree["token_a"]
    tree_a = seeded_tree["tree_a"]
    user_a = seeded_tree["user_a"]

    async with client(token=token_a) as c:
        resp = await c.get(f"/api/trees/{tree_a}/members")

    assert resp.status_code == 200, resp.text
    members = resp.json()
    assert len(members) == 1
    assert members[0]["user_id"] == str(user_a)
    assert members[0]["role"] == "owner"
    assert members[0]["display_name"] == "Alice"


# ---------------------------------------------------------------------------
# Owner adiciona viewer → viewer faz GET → 200; viewer tenta POST → 403.
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_owner_invites_viewer_then_viewer_lists_and_cannot_invite(
    client, seeded_tree, make_user, db_pool
):
    token_a = seeded_tree["token_a"]
    tree_a = seeded_tree["tree_a"]

    # Carol existe em auth.users mas não é membro de nenhuma árvore ainda.
    carol_id, carol_token = make_user(display_name="Carol", email_prefix="carol")
    carol_email = _user_email(db_pool, carol_id)

    # Alice (owner) convida Carol como viewer.
    async with client(token=token_a) as c:
        resp = await c.post(
            f"/api/trees/{tree_a}/members",
            json={"email": carol_email, "role": "viewer"},
        )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["user_id"] == str(carol_id)
    assert body["role"] == "viewer"
    assert body["display_name"] == "Carol"

    # Carol agora vê os membros da árvore.
    async with client(token=carol_token) as c:
        resp = await c.get(f"/api/trees/{tree_a}/members")
    assert resp.status_code == 200, resp.text
    ids = {m["user_id"] for m in resp.json()}
    assert str(carol_id) in ids

    # Carol tenta convidar mais alguém → 403 (RLS + função SECURITY DEFINER).
    dave_id, _ = make_user(display_name="Dave", email_prefix="dave")
    dave_email = _user_email(db_pool, dave_id)
    async with client(token=carol_token) as c:
        resp = await c.post(
            f"/api/trees/{tree_a}/members",
            json={"email": dave_email, "role": "viewer"},
        )
    assert resp.status_code == 403, resp.text


# ---------------------------------------------------------------------------
# Editor não pode convidar (mesmo sendo membro). Owner-only.
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_editor_cannot_invite(client, seeded_tree, make_user, db_pool):
    tree_a = seeded_tree["tree_a"]
    # Promove Dave a editor.
    dave_id, dave_token = make_user(
        display_name="Dave", email_prefix="dave",
        role="editor", tree_id=tree_a,
    )
    # Outro alvo qualquer
    eve_id, _ = make_user(display_name="Eve", email_prefix="eve")
    eve_email = _user_email(db_pool, eve_id)

    async with client(token=dave_token) as c:
        resp = await c.post(
            f"/api/trees/{tree_a}/members",
            json={"email": eve_email, "role": "viewer"},
        )
    assert resp.status_code == 403, resp.text


# ---------------------------------------------------------------------------
# Lookup por email inexistente → 404 com mensagem clara.
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_invite_unknown_email_returns_404(client, seeded_tree):
    token_a = seeded_tree["token_a"]
    tree_a = seeded_tree["tree_a"]

    async with client(token=token_a) as c:
        resp = await c.post(
            f"/api/trees/{tree_a}/members",
            json={"email": "ghost-nao-existe@test.local", "role": "viewer"},
        )
    assert resp.status_code == 404, resp.text
    assert "not registered" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Owner remove a si mesmo → 400.
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_owner_cannot_remove_self(client, seeded_tree):
    token_a = seeded_tree["token_a"]
    tree_a = seeded_tree["tree_a"]
    user_a = seeded_tree["user_a"]

    async with client(token=token_a) as c:
        resp = await c.delete(f"/api/trees/{tree_a}/members/{user_a}")
    assert resp.status_code == 400, resp.text
    assert "owner" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Owner tenta demover a si mesmo via PATCH → 400.
# (O Literal já bloqueia role='owner', então mandamos role='editor'.)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_owner_cannot_demote_self(client, seeded_tree):
    token_a = seeded_tree["token_a"]
    tree_a = seeded_tree["tree_a"]
    user_a = seeded_tree["user_a"]

    async with client(token=token_a) as c:
        resp = await c.patch(
            f"/api/trees/{tree_a}/members/{user_a}",
            json={"role": "editor"},
        )
    assert resp.status_code == 400, resp.text


# ---------------------------------------------------------------------------
# Owner promove viewer → editor.
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_owner_updates_member_role(client, seeded_tree, make_user):
    token_a = seeded_tree["token_a"]
    tree_a = seeded_tree["tree_a"]
    carol_id, _ = make_user(
        display_name="Carol", email_prefix="carol",
        role="viewer", tree_id=tree_a,
    )

    async with client(token=token_a) as c:
        resp = await c.patch(
            f"/api/trees/{tree_a}/members/{carol_id}",
            json={"role": "editor"},
        )
    assert resp.status_code == 200, resp.text
    assert resp.json()["role"] == "editor"


# ---------------------------------------------------------------------------
# Owner remove um viewer com sucesso.
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_owner_removes_member(client, seeded_tree, make_user):
    token_a = seeded_tree["token_a"]
    tree_a = seeded_tree["tree_a"]
    carol_id, carol_token = make_user(
        display_name="Carol", email_prefix="carol",
        role="viewer", tree_id=tree_a,
    )

    async with client(token=token_a) as c:
        resp = await c.delete(f"/api/trees/{tree_a}/members/{carol_id}")
    assert resp.status_code == 204, resp.text

    # Carol não vê mais a árvore.
    async with client(token=carol_token) as c:
        resp = await c.get(f"/api/trees/{tree_a}/members")
    # RLS filtra: Carol não é membro mais → lista vazia.
    assert resp.status_code == 200
    assert resp.json() == []


# ---------------------------------------------------------------------------
# DELETE de um user_id que não é membro → 404.
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_delete_unknown_member_returns_404(client, seeded_tree, make_user):
    token_a = seeded_tree["token_a"]
    tree_a = seeded_tree["tree_a"]
    stranger_id, _ = make_user(display_name="Stranger", email_prefix="stranger")

    async with client(token=token_a) as c:
        resp = await c.delete(f"/api/trees/{tree_a}/members/{stranger_id}")
    assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# POST duplicado (já é membro) → 409 (UniqueViolation handler global).
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_invite_existing_member_is_409(
    client, seeded_tree, make_user, db_pool
):
    token_a = seeded_tree["token_a"]
    tree_a = seeded_tree["tree_a"]
    carol_id, _ = make_user(
        display_name="Carol", email_prefix="carol",
        role="viewer", tree_id=tree_a,
    )
    carol_email = _user_email(db_pool, carol_id)

    async with client(token=token_a) as c:
        resp = await c.post(
            f"/api/trees/{tree_a}/members",
            json={"email": carol_email, "role": "viewer"},
        )
    assert resp.status_code == 409, resp.text


# ---------------------------------------------------------------------------
# GET /api/me continua listando todas as árvores onde é membro.
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_me_lists_all_member_trees_after_invite(
    client, seeded_tree, make_user, db_pool
):
    token_a = seeded_tree["token_a"]
    token_b = seeded_tree["token_b"]
    tree_a = seeded_tree["tree_a"]
    tree_b = seeded_tree["tree_b"]

    # Bob convida Alice como editor de tree_b.
    alice_email = _user_email(db_pool, seeded_tree["user_a"])
    async with client(token=token_b) as c:
        resp = await c.post(
            f"/api/trees/{tree_b}/members",
            json={"email": alice_email, "role": "editor"},
        )
    assert resp.status_code == 201, resp.text

    # Alice agora vê as duas árvores em /api/me.
    async with client(token=token_a) as c:
        resp = await c.get("/api/me")
    assert resp.status_code == 200, resp.text
    tree_ids = {m["tree"]["id"] for m in resp.json()["trees"]}
    assert str(tree_a) in tree_ids
    assert str(tree_b) in tree_ids


# ---------------------------------------------------------------------------
# Email lookup case-insensitive.
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_invite_email_case_insensitive(
    client, seeded_tree, make_user, db_pool
):
    token_a = seeded_tree["token_a"]
    tree_a = seeded_tree["tree_a"]
    carol_id, _ = make_user(display_name="Carol", email_prefix="carol")
    carol_email = _user_email(db_pool, carol_id)

    async with client(token=token_a) as c:
        resp = await c.post(
            f"/api/trees/{tree_a}/members",
            json={"email": carol_email.upper(), "role": "viewer"},
        )
    assert resp.status_code == 201, resp.text
    assert resp.json()["user_id"] == str(carol_id)


# ---------------------------------------------------------------------------
# Non-member GET → []  (RLS filtra; sem 404 explícito).
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_non_member_get_returns_empty_list(client, seeded_tree):
    """User A não é membro de tree_b → GET /members → []."""
    token_a = seeded_tree["token_a"]
    tree_b = seeded_tree["tree_b"]

    async with client(token=token_a) as c:
        resp = await c.get(f"/api/trees/{tree_b}/members")
    assert resp.status_code == 200
    assert resp.json() == []
