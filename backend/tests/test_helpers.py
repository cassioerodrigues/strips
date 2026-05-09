"""
test_helpers.py — testes unitários de app/services/helpers.py.

Cobre os três casos relevantes de ensure_uuid_order:
  1. a < b  → retorna (a, b) sem swap.
  2. a > b  → retorna (b, a) com swap.
  3. a == b → retorna (a, b) sem swap (a constraint do banco rejeita esse caso).
"""
from __future__ import annotations

import uuid

import pytest

from app.services.helpers import ensure_uuid_order


# UUIDs fixos para tornar os testes determinísticos.
# UUID(int=1) < UUID(int=2) — garante a relação de ordem.
_SMALL = uuid.UUID(int=1)
_LARGE = uuid.UUID(int=2)


class TestEnsureUuidOrder:
    def test_already_ordered_returns_unchanged(self):
        """Quando a < b, retorna (a, b) — sem swap."""
        result = ensure_uuid_order(_SMALL, _LARGE)
        assert result == (_SMALL, _LARGE)

    def test_reversed_order_swaps(self):
        """Quando a > b, retorna (b, a) — swap garante a constraint do banco."""
        result = ensure_uuid_order(_LARGE, _SMALL)
        assert result == (_SMALL, _LARGE)

    def test_equal_uuids_returns_as_is(self):
        """Quando a == b, retorna (a, a) — banco rejeitará via CheckViolation (a <> b)."""
        same = uuid.UUID(int=42)
        result = ensure_uuid_order(same, same)
        assert result == (same, same)

    def test_return_type_is_tuple_of_uuid(self):
        """Retorno deve ser tuple[UUID, UUID]."""
        result = ensure_uuid_order(_SMALL, _LARGE)
        assert isinstance(result, tuple)
        assert len(result) == 2
        assert all(isinstance(v, uuid.UUID) for v in result)

    def test_invariant_a_lte_b_holds_after_swap(self):
        """Após ensure_uuid_order, result[0] <= result[1] sempre."""
        a, b = ensure_uuid_order(_LARGE, _SMALL)
        assert a <= b

    def test_is_pure_does_not_mutate_inputs(self):
        """Função pura: os UUIDs originais não são alterados."""
        orig_a = uuid.UUID(int=99)
        orig_b = uuid.UUID(int=1)
        _ = ensure_uuid_order(orig_a, orig_b)
        # UUIDs são imutáveis em Python; verificamos apenas que os valores se mantêm.
        assert orig_a == uuid.UUID(int=99)
        assert orig_b == uuid.UUID(int=1)
