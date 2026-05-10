"""
test_schemas.py — testes dos schemas Pydantic (Issue #4).

Critérios mínimos de aceite:
  - EventCreate rejeita quando person_id e union_id são ambos None.
  - EventCreate aceita quando apenas person_id está setado.
  - EventCreate aceita quando apenas union_id está setado.
  - EventCreate aceita quando ambos estão setados (o banco tem OR, não XOR).
  - `from app.schemas import *` não lança exceção.
"""

import uuid

import pytest
from pydantic import ValidationError

from app.schemas import (
    EventCreate,
    EventOut,
    MediaCreate,
    MediaLinkPayload,
    MediaOut,
    MeResponse,
    ParentLinkCreate,
    PersonCreate,
    PersonOut,
    PersonUpdate,
    RelationsResponse,
    TreeCreate,
    TreeOut,
    TreeUpdate,
    UnionCreate,
    UnionOut,
    UnionUpdate,
    UploadUrlRequest,
    UploadUrlResponse,
)
from app.schemas.auth import TreeMembershipOut


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

PERSON_ID = uuid.uuid4()
UNION_ID = uuid.uuid4()
TREE_ID = uuid.uuid4()


def _base_event(**kwargs) -> dict:
    """Campos mínimos para um EventCreate válido."""
    return {"type": "baptism", **kwargs}


# ---------------------------------------------------------------------------
# EventCreate — validação XOR (check da migration 0005)
# ---------------------------------------------------------------------------


class TestEventCreateRequiresPersonOrUnion:
    def test_rejects_when_both_ids_are_none(self):
        """Nenhum dos dois setado → ValidationError."""
        with pytest.raises(ValidationError) as exc_info:
            EventCreate(**_base_event())
        errors = exc_info.value.errors()
        assert any(
            "person_id" in str(e) or "union_id" in str(e) or "person_or_union" in str(e)
            for e in errors
        ), f"Esperava erro relacionado a person_id/union_id, got: {errors}"

    def test_accepts_with_person_id_only(self):
        """Apenas person_id setado → válido."""
        event = EventCreate(**_base_event(person_id=PERSON_ID))
        assert event.person_id == PERSON_ID
        assert event.union_id is None

    def test_accepts_with_union_id_only(self):
        """Apenas union_id setado → válido."""
        event = EventCreate(**_base_event(union_id=UNION_ID))
        assert event.union_id == UNION_ID
        assert event.person_id is None

    def test_accepts_with_both_ids_set(self):
        """Ambos setados também é válido (banco usa OR, não XOR)."""
        event = EventCreate(**_base_event(person_id=PERSON_ID, union_id=UNION_ID))
        assert event.person_id == PERSON_ID
        assert event.union_id == UNION_ID


# ---------------------------------------------------------------------------
# TreeCreate / TreeOut
# ---------------------------------------------------------------------------


class TestTreeSchemas:
    def test_tree_create_minimal(self):
        t = TreeCreate(name="Família Silva")
        assert t.name == "Família Silva"
        assert t.description is None

    def test_tree_update_all_optional(self):
        """TreeUpdate sem campos → válido (PATCH parcial)."""
        u = TreeUpdate()
        assert u.name is None
        assert u.description is None

    def test_tree_out_from_dict(self):
        data = {
            "id": uuid.uuid4(),
            "owner_id": uuid.uuid4(),
            "name": "Test Tree",
        }
        t = TreeOut(**data)
        assert t.name == "Test Tree"


# ---------------------------------------------------------------------------
# PersonCreate / PersonOut
# ---------------------------------------------------------------------------


class TestPersonSchemas:
    def test_person_create_minimal(self):
        p = PersonCreate()
        assert p.sex == "U"
        assert p.is_living is True
        assert p.tags == []
        assert p.external_ids == {}

    def test_person_create_full(self):
        p = PersonCreate(
            first_name="João",
            last_name="Silva",
            sex="M",
            birth_year=1980,
            birth_month=3,
            birth_day=15,
            birth_place="Lisboa",
            tags=["pesquisado"],
        )
        assert p.first_name == "João"
        assert p.sex == "M"
        assert "pesquisado" in p.tags

    def test_person_update_all_optional(self):
        """PersonUpdate sem campos → válido."""
        u = PersonUpdate()
        assert u.first_name is None
        assert u.sex is None

    def test_person_out_sex_literal(self):
        """Sex só aceita os valores do enum."""
        with pytest.raises(ValidationError):
            PersonCreate(sex="X")  # type: ignore[arg-type]

    def test_person_out_from_dict(self):
        data = {
            "id": uuid.uuid4(),
            "tree_id": TREE_ID,
            "sex": "F",
            "is_living": True,
            "tags": [],
            "external_ids": {},
        }
        p = PersonOut(**data)
        assert p.sex == "F"


# ---------------------------------------------------------------------------
# UnionCreate / UnionOut
# ---------------------------------------------------------------------------


class TestUnionSchemas:
    def test_union_create_minimal(self):
        a_id = uuid.uuid4()
        b_id = uuid.uuid4()
        u = UnionCreate(partner_a_id=a_id, partner_b_id=b_id)
        assert u.type == "marriage"
        assert u.status == "ongoing"

    def test_union_update_all_optional(self):
        u = UnionUpdate()
        assert u.type is None
        assert u.status is None

    def test_union_type_literal(self):
        with pytest.raises(ValidationError):
            UnionCreate(
                partner_a_id=uuid.uuid4(),
                partner_b_id=uuid.uuid4(),
                type="invalid_type",  # type: ignore[arg-type]
            )


# ---------------------------------------------------------------------------
# MediaCreate / MediaOut / UploadUrl
# ---------------------------------------------------------------------------


class TestMediaSchemas:
    def test_media_create_minimal(self):
        m = MediaCreate(
            tree_id=TREE_ID,
            kind="photo",
            # storage_path deve comecar com `tree_<tree_id>/<entity_type>/...`
            # — validado pelo model_validator de MediaCreate.
            storage_path=f"tree_{TREE_ID}/person/{PERSON_ID}/abc-foto.jpg",
        )
        assert m.kind == "photo"
        assert m.mime_type is None

    def test_media_kind_literal(self):
        with pytest.raises(ValidationError):
            MediaCreate(
                tree_id=TREE_ID,
                kind="gif",  # type: ignore[arg-type]
                storage_path=f"tree_{TREE_ID}/person/{PERSON_ID}/x.gif",
            )

    def test_media_create_storage_path_must_match_tree_id(self):
        """storage_path com prefixo de outra tree -> ValidationError."""
        other_tree = uuid.uuid4()
        with pytest.raises(ValidationError):
            MediaCreate(
                tree_id=TREE_ID,
                kind="photo",
                storage_path=f"tree_{other_tree}/person/{PERSON_ID}/x.jpg",
            )

    def test_media_create_storage_path_invalid_entity_type(self):
        """storage_path com entity_type fora da whitelist -> ValidationError."""
        with pytest.raises(ValidationError):
            MediaCreate(
                tree_id=TREE_ID,
                kind="photo",
                storage_path=f"tree_{TREE_ID}/hacker/{PERSON_ID}/x.jpg",
            )

    def test_upload_url_request_invalid_entity_type(self):
        """entity_type fora do Literal -> ValidationError (antes de tocar DB)."""
        with pytest.raises(ValidationError):
            UploadUrlRequest(
                filename="f.jpg",
                mime_type="image/jpeg",
                entity_type="hacker",  # type: ignore[arg-type]
                entity_id=PERSON_ID,
            )

    def test_upload_url_request(self):
        req = UploadUrlRequest(
            filename="foto.jpg",
            mime_type="image/jpeg",
            entity_type="person",
            entity_id=PERSON_ID,
        )
        assert req.entity_type == "person"

    def test_media_out_download_url_defaults_to_none(self):
        """MediaOut.download_url é None por default (Issue #6 Fix 2)."""
        m = MediaOut(
            id=uuid.uuid4(),
            tree_id=TREE_ID,
            kind="photo",
            storage_path="tree/x/y.jpg",
        )
        assert m.download_url is None

    def test_media_out_download_url_accepts_string(self):
        """MediaOut.download_url aceita string quando setada."""
        m = MediaOut(
            id=uuid.uuid4(),
            tree_id=TREE_ID,
            kind="photo",
            storage_path="tree/x/y.jpg",
            download_url="https://example.com/signed/y.jpg",
        )
        assert m.download_url == "https://example.com/signed/y.jpg"

    def test_media_link_payload_defaults_is_primary_false(self):
        """MediaLinkPayload sem campos → is_primary=False (body opcional)."""
        p = MediaLinkPayload()
        assert p.is_primary is False

    def test_media_link_payload_accepts_true(self):
        """MediaLinkPayload com is_primary=True é aceito."""
        p = MediaLinkPayload(is_primary=True)
        assert p.is_primary is True


# ---------------------------------------------------------------------------
# TreeMembershipOut — role deve usar Literal TreeRole
# ---------------------------------------------------------------------------


class TestTreeMembershipOut:
    def test_rejects_invalid_role(self):
        """role='invalid' deve levantar ValidationError."""
        with pytest.raises(ValidationError):
            TreeMembershipOut(tree=TreeOut(id=uuid.uuid4(), owner_id=uuid.uuid4(), name="T"), role="invalid")

    def test_accepts_valid_role(self):
        """role='owner' deve ser aceito sem erros."""
        m = TreeMembershipOut(tree=TreeOut(id=uuid.uuid4(), owner_id=uuid.uuid4(), name="T"), role="owner")
        assert m.role == "owner"


# ---------------------------------------------------------------------------
# ParentLinkCreate — child_id removido do body (vem do path param)
# ---------------------------------------------------------------------------


class TestParentLinkCreate:
    def test_parent_link_create_no_child_id(self):
        """ParentLinkCreate não tem child_id — vem do path param (Fix 4)."""
        link = ParentLinkCreate(parent_id=uuid.uuid4())
        assert link.kind == "biological"
        assert link.notes is None
        assert not hasattr(link, "child_id")

    def test_parent_link_create_with_kind(self):
        """ParentLinkCreate aceita kind alternativo."""
        link = ParentLinkCreate(parent_id=uuid.uuid4(), kind="adoptive", notes="adotado em 1990")
        assert link.kind == "adoptive"
        assert link.notes == "adotado em 1990"


# ---------------------------------------------------------------------------
# RelationsResponse
# ---------------------------------------------------------------------------


class TestRelationsResponse:
    def test_empty_relations(self):
        r = RelationsResponse()
        assert r.parents == []
        assert r.spouse is None
        assert r.siblings == []
        assert r.children == []


# ---------------------------------------------------------------------------
# Smoke test: from app.schemas import *
# ---------------------------------------------------------------------------


def test_star_import_works():
    """Garante que o __init__.py expõe todos os nomes esperados."""
    import app.schemas as schemas  # noqa: F401

    expected_names = [
        "MeResponse",
        "TreeCreate",
        "TreeUpdate",
        "TreeOut",
        "PersonCreate",
        "PersonUpdate",
        "PersonOut",
        "UnionCreate",
        "UnionUpdate",
        "UnionOut",
        "EventCreate",
        "EventOut",
        "MediaCreate",
        "MediaOut",
        "UploadUrlRequest",
        "UploadUrlResponse",
        "RelationsResponse",
    ]
    for name in expected_names:
        assert hasattr(schemas, name), f"app.schemas está faltando: {name}"
