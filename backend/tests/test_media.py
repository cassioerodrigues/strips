"""
test_media.py — fluxo de mídia + signed URL via banco real (Issue #10).

A camada HTTP do Supabase Storage é interceptada por `respx`; o banco
real é usado para a tabela `media` e RLS. Pulado quando TEST_DATABASE_URL
ausente.

Cobre:
  - POST /api/trees/{id}/media/upload-url chama o gateway de Storage.
  - POST /api/trees/{id}/media insere row em `media` (e RLS deixa o owner).
  - GET /api/media/{id}/download-url chama o gateway e devolve URL absoluta.
"""
from __future__ import annotations

import os
import re
import uuid

import httpx
import pytest
import respx

pytestmark = pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"),
    reason="TEST_DATABASE_URL necessário",
)


SUPABASE_BASE = "https://fake.supabase.co"
BUCKET = "stirps-media"


@pytest.mark.anyio
async def test_upload_url_calls_storage_gateway(client, seeded_tree):
    """upload-url deve assinar via REST do Supabase e devolver URL absoluta."""
    token = seeded_tree["token_a"]
    tree_id = seeded_tree["tree_a"]
    person_id = seeded_tree["person_a"]

    with respx.mock(assert_all_called=True) as mock:
        mock.post(
            re.compile(
                rf"^{re.escape(SUPABASE_BASE)}/storage/v1/object/upload/sign/{BUCKET}/.*$"
            )
        ).mock(
            return_value=httpx.Response(
                200,
                json={"url": f"/object/upload/sign/{BUCKET}/tree_x/path?token=abc"},
            )
        )

        async with client(token=token) as c:
            resp = await c.post(
                f"/api/trees/{tree_id}/media/upload-url",
                json={
                    "filename": "foto.jpg",
                    "mime_type": "image/jpeg",
                    "entity_type": "person",
                    "entity_id": str(person_id),
                },
            )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["url"].startswith(f"{SUPABASE_BASE}/storage/v1/")
    assert body["storage_path"].startswith(f"tree_{tree_id}/person/{person_id}/")


@pytest.mark.anyio
async def test_create_media_persists_row_and_download_url_calls_storage(
    client, seeded_tree, db_pool
):
    """POST /media salva metadata; GET /download-url assina via gateway."""
    token = seeded_tree["token_a"]
    tree_id = seeded_tree["tree_a"]
    person_id = seeded_tree["person_a"]

    storage_path = f"tree_{tree_id}/person/{person_id}/{uuid.uuid4()}-foto.jpg"

    async with client(token=token) as c:
        # 1. Insere metadata em `media`. Sem mock de HTTP — não há chamada externa.
        create_resp = await c.post(
            f"/api/trees/{tree_id}/media",
            json={
                "tree_id": str(tree_id),
                "kind": "photo",
                "storage_path": storage_path,
                "mime_type": "image/jpeg",
                "size_bytes": 12345,
                "title": "Retrato",
            },
        )
        assert create_resp.status_code == 201, create_resp.text
        media = create_resp.json()
        assert media["storage_path"] == storage_path

        # 2. Pedir download-url — agora SIM bate no gateway (mockado).
        with respx.mock(assert_all_called=True) as mock:
            mock.post(
                f"{SUPABASE_BASE}/storage/v1/object/sign/{BUCKET}/{storage_path}"
            ).mock(
                return_value=httpx.Response(
                    200,
                    json={"signedURL": f"/object/sign/{BUCKET}/{storage_path}?token=xyz"},
                )
            )
            dl_resp = await c.get(f"/api/media/{media['id']}/download-url")

    assert dl_resp.status_code == 200, dl_resp.text
    url = dl_resp.json()["url"]
    assert url.startswith(f"{SUPABASE_BASE}/storage/v1/")
    assert "token=xyz" in url


@pytest.mark.anyio
async def test_download_url_unknown_media_returns_404(client, seeded_tree):
    """Mídia inexistente OU bloqueada por RLS retorna 404 sem tocar o gateway."""
    token = seeded_tree["token_a"]
    bogus = uuid.uuid4()

    with respx.mock(assert_all_called=False) as mock:
        # Nenhuma route configurada — se o gateway for chamado, o teste explode.
        async with client(token=token) as c:
            resp = await c.get(f"/api/media/{bogus}/download-url")

    assert resp.status_code == 404, resp.text
    assert not mock.calls
