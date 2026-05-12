"""
test_external_records.py — testes integrados de external_records (Issue #14).

Cobre todos os critérios de aceite da issue:
  - GET ?status=suggested retorna lista ordenada por confiança.
  - PATCH .../{id} com status=accepted + person_id: row atualizada,
    reviewed_at preenchido com now(), reviewed_by com auth.uid().
  - Viewer não consegue alterar status → 403.

Plus testes auxiliares:
  - Filtro por person_id e por source.
  - PATCH sem `status` no body não toca reviewed_at/reviewed_by.
  - DELETE existente como owner → 204; inexistente → 404.
  - GET ?status=all retorna todas as linhas independentemente do status.

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
# Helper: insere registros direto no banco bypassando RLS (service_role pool).
# Útil para testar GET/PATCH sem depender do POST passar antes.
# ---------------------------------------------------------------------------


def _insert_record(
    db_pool,
    tree_id: uuid.UUID,
    *,
    source: str = "familysearch",
    confidence: int | None = None,
    status_v: str = "suggested",
    person_id: uuid.UUID | None = None,
    title: str | None = None,
) -> uuid.UUID:
    rec_id = uuid.uuid4()
    with db_pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO external_records(
                    id, tree_id, person_id, source, title,
                    confidence, status
                ) VALUES (
                    %s, %s, %s, %s, %s,
                    %s, %s::record_status_t
                )
                """,
                (rec_id, tree_id, person_id, source, title, confidence, status_v),
            )
        conn.commit()
    return rec_id


# ---------------------------------------------------------------------------
# CREATE — owner cria sugestão manual com confidence + payload.
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_owner_creates_external_record(client, seeded_tree):
    token = seeded_tree["token_a"]
    tree_id = seeded_tree["tree_a"]
    person_id = seeded_tree["person_a"]

    async with client(token=token) as c:
        resp = await c.post(
            f"/api/trees/{tree_id}/external-records",
            json={
                "source": "familysearch",
                "source_id": "FS-12345",
                "source_url": "https://familysearch.org/ark:/61903/1:1:XXX",
                "title": "Birth of Carla Silva, 1899",
                "subtitle": "Italy, Treviso, Civil Registration",
                "confidence": 85,
                "payload": {"raw": "snapshot", "fields": {"name": "Carla"}},
                "person_id": str(person_id),
            },
        )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["source"] == "familysearch"
    assert body["confidence"] == 85
    assert body["status"] == "suggested"
    assert body["person_id"] == str(person_id)
    assert body["payload"] == {"raw": "snapshot", "fields": {"name": "Carla"}}
    assert body["reviewed_at"] is None
    assert body["reviewed_by"] is None


# ---------------------------------------------------------------------------
# Aceite 1: GET ?status=suggested retorna lista ordenada por confiança DESC.
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_list_suggested_ordered_by_confidence(client, seeded_tree, db_pool):
    token = seeded_tree["token_a"]
    tree_id = seeded_tree["tree_a"]

    # Insere 3 sugestões com confidence diferentes, plus 1 accepted (não deve aparecer).
    low_id = _insert_record(db_pool, tree_id, confidence=10, title="Low")
    high_id = _insert_record(db_pool, tree_id, confidence=90, title="High")
    mid_id = _insert_record(db_pool, tree_id, confidence=50, title="Mid")
    _insert_record(db_pool, tree_id, confidence=99, status_v="accepted", title="Accepted")

    async with client(token=token) as c:
        resp = await c.get(f"/api/trees/{tree_id}/external-records")  # default status=suggested
    assert resp.status_code == 200, resp.text
    rows = resp.json()
    ids = [r["id"] for r in rows]

    # Apenas as três 'suggested' devem estar.
    assert set(ids) == {str(high_id), str(mid_id), str(low_id)}
    # Ordenado por confidence DESC.
    assert ids == [str(high_id), str(mid_id), str(low_id)]
    # Todas com status=suggested.
    assert all(r["status"] == "suggested" for r in rows)


# ---------------------------------------------------------------------------
# Filtro por person_id e por source.
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_list_filter_by_person_and_source(client, seeded_tree, db_pool):
    token = seeded_tree["token_a"]
    tree_id = seeded_tree["tree_a"]
    person_id = seeded_tree["person_a"]

    linked = _insert_record(db_pool, tree_id, source="familysearch", person_id=person_id, confidence=70)
    other_person = _insert_record(db_pool, tree_id, source="familysearch", person_id=None, confidence=70)
    other_source = _insert_record(db_pool, tree_id, source="archivio_treviso", person_id=person_id, confidence=70)

    async with client(token=token) as c:
        # Filtro por person_id
        resp = await c.get(
            f"/api/trees/{tree_id}/external-records",
            params={"person_id": str(person_id)},
        )
        assert resp.status_code == 200, resp.text
        ids = {r["id"] for r in resp.json()}
        assert str(linked) in ids
        assert str(other_source) in ids
        assert str(other_person) not in ids

        # Filtro por source
        resp = await c.get(
            f"/api/trees/{tree_id}/external-records",
            params={"source": "archivio_treviso"},
        )
        assert resp.status_code == 200, resp.text
        ids = {r["id"] for r in resp.json()}
        assert ids == {str(other_source)}

        # Combinado: person_id + source
        resp = await c.get(
            f"/api/trees/{tree_id}/external-records",
            params={"person_id": str(person_id), "source": "familysearch"},
        )
        assert resp.status_code == 200, resp.text
        ids = {r["id"] for r in resp.json()}
        assert ids == {str(linked)}


# ---------------------------------------------------------------------------
# GET ?status=all retorna todas as linhas independentemente do status.
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_list_status_all(client, seeded_tree, db_pool):
    token = seeded_tree["token_a"]
    tree_id = seeded_tree["tree_a"]

    s = _insert_record(db_pool, tree_id, confidence=10, status_v="suggested")
    a = _insert_record(db_pool, tree_id, confidence=20, status_v="accepted")
    r = _insert_record(db_pool, tree_id, confidence=30, status_v="rejected")

    async with client(token=token) as c:
        resp = await c.get(f"/api/trees/{tree_id}/external-records", params={"status": "all"})
    assert resp.status_code == 200, resp.text
    ids = {row["id"] for row in resp.json()}
    assert {str(s), str(a), str(r)}.issubset(ids)


# ---------------------------------------------------------------------------
# Aceite 2: PATCH com status=accepted + person_id preenche reviewed_at/by.
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_patch_accepted_sets_reviewed_metadata(client, seeded_tree, db_pool):
    token = seeded_tree["token_a"]
    tree_id = seeded_tree["tree_a"]
    person_id = seeded_tree["person_a"]
    user_a = seeded_tree["user_a"]

    rec_id = _insert_record(db_pool, tree_id, confidence=50)

    async with client(token=token) as c:
        resp = await c.patch(
            f"/api/external-records/{rec_id}",
            json={"status": "accepted", "person_id": str(person_id)},
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "accepted"
    assert body["person_id"] == str(person_id)
    assert body["reviewed_at"] is not None  # preenchido com now()
    assert body["reviewed_by"] == str(user_a)  # auth.uid()


# ---------------------------------------------------------------------------
# PATCH sem `status` no body NÃO toca reviewed_at/reviewed_by.
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_patch_without_status_does_not_set_reviewed(client, seeded_tree, db_pool):
    token = seeded_tree["token_a"]
    tree_id = seeded_tree["tree_a"]
    person_id = seeded_tree["person_a"]

    rec_id = _insert_record(db_pool, tree_id, confidence=50)

    async with client(token=token) as c:
        resp = await c.patch(
            f"/api/external-records/{rec_id}",
            json={"person_id": str(person_id)},  # sem status
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["person_id"] == str(person_id)
    assert body["status"] == "suggested"  # inalterado
    assert body["reviewed_at"] is None
    assert body["reviewed_by"] is None


@pytest.mark.anyio
async def test_patch_explicit_null_status_is_ignored(client, seeded_tree, db_pool):
    """`{"status": null}` no PATCH não zera o status nem dispara reviewed_at."""
    token = seeded_tree["token_a"]
    tree_id = seeded_tree["tree_a"]
    person_id = seeded_tree["person_a"]

    rec_id = _insert_record(db_pool, tree_id, confidence=50)

    async with client(token=token) as c:
        resp = await c.patch(
            f"/api/external-records/{rec_id}",
            json={"status": None, "person_id": str(person_id)},
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "suggested"
    assert body["reviewed_at"] is None
    assert body["reviewed_by"] is None
    assert body["person_id"] == str(person_id)


# ---------------------------------------------------------------------------
# Aceite 3: viewer não consegue alterar status → 403.
# (Aproveita pra confirmar 403 em POST e DELETE também.)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_viewer_cannot_write(client, seeded_tree, db_pool, make_user):
    tree_id = seeded_tree["tree_a"]

    # Cria um viewer na tree_a.
    _, viewer_token = make_user(
        display_name="Vito", email_prefix="vito",
        role="viewer", tree_id=tree_id,
    )

    # Sugestão pré-existente.
    rec_id = _insert_record(db_pool, tree_id, confidence=70)

    async with client(token=viewer_token) as c:
        # Viewer consegue listar (RLS select permite member).
        resp = await c.get(f"/api/trees/{tree_id}/external-records")
        assert resp.status_code == 200, resp.text
        assert any(r["id"] == str(rec_id) for r in resp.json())

        # Viewer não consegue PATCH (status).
        resp = await c.patch(
            f"/api/external-records/{rec_id}",
            json={"status": "accepted"},
        )
        assert resp.status_code == 403, resp.text

        # Viewer não consegue POST.
        resp = await c.post(
            f"/api/trees/{tree_id}/external-records",
            json={"source": "manual", "confidence": 50},
        )
        assert resp.status_code == 403, resp.text

        # Viewer não consegue DELETE.
        resp = await c.delete(f"/api/external-records/{rec_id}")
        assert resp.status_code == 403, resp.text


# ---------------------------------------------------------------------------
# DELETE: owner remove com sucesso; inexistente → 404.
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_delete_owner_succeeds_and_missing_returns_404(client, seeded_tree, db_pool):
    token = seeded_tree["token_a"]
    tree_id = seeded_tree["tree_a"]

    rec_id = _insert_record(db_pool, tree_id, confidence=42)

    async with client(token=token) as c:
        resp = await c.delete(f"/api/external-records/{rec_id}")
        assert resp.status_code == 204, resp.text

        # Segunda chamada → 404.
        resp = await c.delete(f"/api/external-records/{rec_id}")
        assert resp.status_code == 404, resp.text

        # ID inexistente também → 404.
        resp = await c.delete(f"/api/external-records/{uuid.uuid4()}")
        assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# Isolamento RLS entre árvores: owner da tree_b não enxerga records da tree_a.
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_other_tree_owner_cannot_see_records(client, seeded_tree, db_pool):
    token_b = seeded_tree["token_b"]
    tree_a = seeded_tree["tree_a"]

    _insert_record(db_pool, tree_a, confidence=50)

    async with client(token=token_b) as c:
        # Listagem na tree_a (não-membro) → RLS retorna 0 linhas.
        # (RLS no SELECT não levanta erro — apenas filtra.)
        resp = await c.get(f"/api/trees/{tree_a}/external-records")
    assert resp.status_code == 200, resp.text
    assert resp.json() == []
