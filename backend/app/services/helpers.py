"""helpers.py — funções puras reutilizáveis entre services.

Sem efeitos colaterais, sem imports de FastAPI ou psycopg.
"""
from __future__ import annotations

import uuid


def ensure_uuid_order(a: uuid.UUID, b: uuid.UUID) -> tuple[uuid.UUID, uuid.UUID]:
    """Garante a invariante `partner_a_id < partner_b_id` exigida pela tabela `unions`.

    A comparação é feita por valor inteiro do UUID (equivalente à comparação
    lexicográfica de strings canônicas, pois UUID é um número de 128 bits).

    Caso a == b, retorna (a, b) sem alteração — a constraint `partner_a_id <> partner_b_id`
    do banco irá rejeitar essa situação com CheckViolation (mapeado em errors.py → 422).

    Args:
        a: UUID do primeiro parceiro (como enviado pelo cliente).
        b: UUID do segundo parceiro (como enviado pelo cliente).

    Returns:
        Tupla (menor, maior) que satisfaz a constraint `a < b` da tabela unions.
    """
    return (a, b) if a < b else (b, a)
