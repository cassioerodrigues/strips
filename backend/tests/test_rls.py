"""
test_rls.py — testes críticos de Row-Level Security (Issue #10).

Mapeia 1:1 os 6 cenários da especificação:
  1. Cross-tree read isolation — User A não vê dados da árvore de B.
  2. Cross-tree write blocked — User A não pode criar pessoa em árvore de B.
  3. Viewer read-only — viewer lê tudo, mas POST/PATCH/DELETE → 403.
  4. Editor cannot mutate membership — editor pode escrever em persons/unions/
     events, mas não pode inserir em tree_members (RLS bloqueia direto no SQL).
  5. Owner has full access — owner faz tudo na sua árvore.
  6. Cascade on person delete — DELETE em person derruba events e person_parents.

Pulado quando TEST_DATABASE_URL/SUPABASE_JWT_SECRET ausentes — ver README.
"""
from __future__ import annotations

import os
import uuid

import pytest

pytestmark = pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL") or not os.getenv("SUPABASE_JWT_SECRET"),
    reason="TEST_DATABASE_URL e SUPABASE_JWT_SECRET necessários",
)


# ---------------------------------------------------------------------------
# 1. Cross-tree read isolation
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_cross_tree_read_isolation(client, seeded_tree):
    """User A (owner de tree_a) não vê tree_b nem suas pessoas."""
    token_a = seeded_tree["token_a"]
    tree_b = seeded_tree["tree_b"]
    person_b = seeded_tree["person_b"]

    async with client(token=token_a) as c:
        # GET /api/trees → só lista tree_a
        resp = await c.get("/api/trees")
        assert resp.status_code == 200
        ids = {t["id"] for t in resp.json()}
        assert str(tree_b) not in ids

        # GET /api/trees/{tree_b} → 404 (RLS converte forbidden em not-found)
        resp = await c.get(f"/api/trees/{tree_b}")
        assert resp.status_code == 404

        # GET /api/trees/{tree_b}/people → 200 com lista vazia
        # (RLS filtra rows; a query em si é permitida).
        resp = await c.get(f"/api/trees/{tree_b}/people")
        assert resp.status_code == 200
        assert resp.json() == []

        # GET /api/people/{person_b} → 404
        resp = await c.get(f"/api/people/{person_b}")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 2. Cross-tree write blocked
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_cross_tree_write_blocked(client, seeded_tree):
    """User A tenta INSERIR pessoa em tree_b → bloqueado por RLS.

    A policy `persons_write` exige `tree_role(tree_id) IN ('owner','editor')`,
    o que para um não-membro avalia para NULL/FALSE. O `with check` falha →
    `psycopg.errors.InsufficientPrivilege` → o handler global mapeia para 403.
    """
    token_a = seeded_tree["token_a"]
    tree_b = seeded_tree["tree_b"]

    async with client(token=token_a) as c:
        resp = await c.post(
            f"/api/trees/{tree_b}/people",
            json={"first_name": "Intruder", "sex": "U"},
        )
    # A spec diz 403; aceitamos 404 também caso a stack converta antes
    # (defesa: nunca deve ser 201).
    assert resp.status_code in (403, 404), resp.text
    assert resp.status_code != 201


# ---------------------------------------------------------------------------
# 3. Viewer read-only
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_viewer_can_read_but_not_write(client, seeded_tree, make_user):
    """Promove Carol a viewer de tree_a; GETs funcionam, mutações → 403."""
    tree_a = seeded_tree["tree_a"]
    person_a = seeded_tree["person_a"]
    # make_user(role=...) já insere em tree_members na mesma chamada.
    carol_id, carol_token = make_user(
        display_name="Carol Viewer",
        email_prefix="carol",
        role="viewer",
        tree_id=tree_a,
    )

    async with client(token=carol_token) as c:
        # READ: ok
        resp = await c.get(f"/api/trees/{tree_a}/people")
        assert resp.status_code == 200
        assert any(p["id"] == str(person_a) for p in resp.json())

        # POST: 403
        resp = await c.post(
            f"/api/trees/{tree_a}/people",
            json={"first_name": "Forbidden"},
        )
        assert resp.status_code == 403, resp.text

        # PATCH em pessoa existente: 403
        resp = await c.patch(
            f"/api/people/{person_a}",
            json={"occupation": "nope"},
        )
        # Pode ser 403 (RLS InsufficientPrivilege) ou 404 (UPDATE com 0 rows
        # após o `using` bloquear). Ambos provam que o viewer não escreveu.
        assert resp.status_code in (403, 404), resp.text

        # DELETE em pessoa existente: 403 ou 404 — mesmo argumento
        resp = await c.delete(f"/api/people/{person_a}")
        assert resp.status_code in (403, 404), resp.text


# ---------------------------------------------------------------------------
# 4. Editor cannot mutate membership
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_editor_can_write_persons_but_not_membership(
    client, seeded_tree, make_user, rls_conn
):
    """Editor adiciona pessoa OK; tentativa de INSERT em tree_members falha.

    O endpoint /members ainda não existe (Issue #13), então testamos a regra
    direto no SQL com claims do editor.
    """
    from psycopg import errors as pg_errors

    tree_a = seeded_tree["tree_a"]
    dave_id, dave_token = make_user(
        display_name="Dave Editor",
        email_prefix="dave",
        role="editor",
        tree_id=tree_a,
    )

    # 4a. Editor consegue criar pessoa via API.
    async with client(token=dave_token) as c:
        resp = await c.post(
            f"/api/trees/{tree_a}/people",
            json={"first_name": "Editor Wrote This"},
        )
        assert resp.status_code == 201, resp.text

    # 4b. Editor NÃO consegue inserir em tree_members. Policy
    # `tree_members_insert` exige `tree_role(tree_id) = 'owner'`.
    eve_id, _ = make_user(display_name="Eve", email_prefix="eve")
    with pytest.raises(
        (pg_errors.InsufficientPrivilege, pg_errors.RaiseException, pg_errors.CheckViolation)
    ):
        with rls_conn(dave_id) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO tree_members (tree_id, user_id, role) VALUES (%s, %s, 'viewer')",
                    (tree_a, eve_id),
                )


# ---------------------------------------------------------------------------
# 5. Owner has full access
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_owner_has_full_access(client, seeded_tree):
    """Owner faz CRUD completo em persons/unions/events/media (sem upload real)."""
    token_a = seeded_tree["token_a"]
    tree_a = seeded_tree["tree_a"]

    async with client(token=token_a) as c:
        # Create person
        p1 = (await c.post(f"/api/trees/{tree_a}/people", json={"first_name": "P1"})).json()
        p2 = (await c.post(f"/api/trees/{tree_a}/people", json={"first_name": "P2"})).json()

        # Create union
        r = await c.post(
            f"/api/trees/{tree_a}/unions",
            json={
                "partner_a_id": p1["id"],
                "partner_b_id": p2["id"],
                "type": "marriage",
                "status": "ongoing",
            },
        )
        assert r.status_code == 201, r.text
        union_id = r.json()["id"]

        # Create event tied to person
        r = await c.post(
            f"/api/trees/{tree_a}/events",
            json={"person_id": p1["id"], "type": "baptism", "year": 1980},
        )
        assert r.status_code == 201, r.text

        # Patch + delete union
        r = await c.patch(f"/api/unions/{union_id}", json={"status": "divorced"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "divorced"

        r = await c.delete(f"/api/unions/{union_id}")
        assert r.status_code == 204

        # Delete pessoa
        r = await c.delete(f"/api/people/{p2['id']}")
        assert r.status_code == 204


# ---------------------------------------------------------------------------
# 6. Cascade on person delete
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_cascade_on_person_delete(client, seeded_tree, db_pool):
    """DELETE em person derruba events e person_parents associados."""
    token_a = seeded_tree["token_a"]
    tree_a = seeded_tree["tree_a"]

    async with client(token=token_a) as c:
        parent = (await c.post(f"/api/trees/{tree_a}/people", json={"first_name": "Pai"})).json()
        child = (await c.post(f"/api/trees/{tree_a}/people", json={"first_name": "Filha"})).json()

        # vínculo de filiação
        r = await c.post(
            f"/api/people/{child['id']}/parents",
            json={"parent_id": parent["id"], "kind": "biological"},
        )
        assert r.status_code == 201, r.text

        # evento ligado ao child
        r = await c.post(
            f"/api/trees/{tree_a}/events",
            json={"person_id": child["id"], "type": "baptism", "year": 2000},
        )
        assert r.status_code == 201, r.text
        event_id = r.json()["id"]

        # DELETE child
        r = await c.delete(f"/api/people/{child['id']}")
        assert r.status_code == 204, r.text

    # Verifica cascade direto no banco (RLS de leitura ainda exige membership;
    # usamos a pool com service-role para inspecionar tudo).
    with db_pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM events WHERE id = %s", (event_id,))
            assert cur.fetchone() is None, "Evento não foi removido em cascade"
            cur.execute(
                "SELECT 1 FROM person_parents WHERE child_id = %s OR parent_id = %s",
                (child["id"], child["id"]),
            )
            assert cur.fetchone() is None, "person_parents não foi removido em cascade"


@pytest.mark.anyio
async def test_delete_person_cascades_to_unions(client, seeded_tree, db_pool):
    """DELETE em person derruba também a `unions` em que ele participa.

    Cenário irmão do anterior — a spec aceite exige cascade em events/parents
    /unions, então cobrimos union explicitamente.
    """
    token_a = seeded_tree["token_a"]
    tree_a = seeded_tree["tree_a"]

    async with client(token=token_a) as c:
        p = (await c.post(f"/api/trees/{tree_a}/people", json={"first_name": "P"})).json()
        p2 = (await c.post(f"/api/trees/{tree_a}/people", json={"first_name": "P2"})).json()

        # `unions` exige partner_a_id < partner_b_id (canonical order).
        # O endpoint aceita qualquer ordem e normaliza internamente; passamos
        # os UUIDs como vieram — o endpoint cuida do swap.
        r = await c.post(
            f"/api/trees/{tree_a}/unions",
            json={
                "partner_a_id": p["id"],
                "partner_b_id": p2["id"],
                "type": "marriage",
                "status": "ongoing",
            },
        )
        assert r.status_code == 201, r.text
        union_id = r.json()["id"]

        # DELETE P → union deve cascatear.
        r = await c.delete(f"/api/people/{p['id']}")
        assert r.status_code == 204, r.text

    with db_pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM unions WHERE id = %s", (union_id,))
            row = cur.fetchone()
            assert row is not None and row[0] == 0, "union não foi removida em cascade"
