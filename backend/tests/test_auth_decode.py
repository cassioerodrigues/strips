"""Unit tests do decode_jwt — não dependem de DB nem rede.

Geramos um keypair EC P-256 in-process, assinamos tokens ES256 e monkeypatchamos
PyJWKClient.get_signing_key_from_jwt para devolver a chave pública correspondente.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException

from app.auth import Claims, decode_jwt


# Keypair único do módulo de teste.
_PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())
_PUBLIC_KEY = _PRIVATE_KEY.public_key()
_KID = "unit-test-kid"
_JWKS_URL = "https://example.test/auth/v1/.well-known/jwks.json"


class _FakeSigningKey:
    """Imita o objeto que PyJWKClient.get_signing_key_from_jwt() devolve."""
    def __init__(self, key):
        self.key = key


@pytest.fixture(autouse=True)
def _patch_jwk_client(monkeypatch):
    """Substitui o fetch JWKS de rede por um mock que sempre devolve a
    chave pública de teste."""
    def fake_get_signing_key_from_jwt(self, token):
        return _FakeSigningKey(_PUBLIC_KEY)

    monkeypatch.setattr(
        "jwt.PyJWKClient.get_signing_key_from_jwt",
        fake_get_signing_key_from_jwt,
    )
    # Limpar o cache de cliente global entre testes.
    import app.auth
    app.auth._jwk_client = None


def _make_token(claims: dict, kid: str = _KID, private_key=None) -> str:
    return jwt.encode(
        claims,
        private_key or _PRIVATE_KEY,
        algorithm="ES256",
        headers={"kid": kid},
    )


def test_decode_jwt_returns_claims_for_valid_es256_token():
    sub = uuid.uuid4()
    token = _make_token({
        "sub": str(sub),
        "email": "alice@test.local",
        "role": "authenticated",
        "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()),
    })
    claims = decode_jwt(token, _JWKS_URL)
    assert isinstance(claims, Claims)
    assert claims.sub == sub
    assert claims.email == "alice@test.local"
    assert claims.role == "authenticated"


def test_decode_jwt_raises_401_for_expired_token():
    token = _make_token({
        "sub": str(uuid.uuid4()),
        "exp": int((datetime.now(timezone.utc) - timedelta(hours=1)).timestamp()),
    })
    with pytest.raises(HTTPException) as exc:
        decode_jwt(token, _JWKS_URL)
    assert exc.value.status_code == 401
    assert "expired" in exc.value.detail.lower()


def test_decode_jwt_raises_401_for_bad_signature():
    # Assina com OUTRA chave privada — a pública mockada não vai bater.
    other_key = ec.generate_private_key(ec.SECP256R1())
    token = _make_token(
        {"sub": str(uuid.uuid4()),
         "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp())},
        private_key=other_key,
    )
    with pytest.raises(HTTPException) as exc:
        decode_jwt(token, _JWKS_URL)
    assert exc.value.status_code == 401


def test_decode_jwt_raises_401_for_missing_sub():
    token = _make_token({
        "email": "x@y.z",
        "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()),
    })
    with pytest.raises(HTTPException) as exc:
        decode_jwt(token, _JWKS_URL)
    assert exc.value.status_code == 401
    assert "sub" in exc.value.detail.lower()


def test_decode_jwt_raises_401_for_invalid_sub_uuid():
    token = _make_token({
        "sub": "not-a-uuid",
        "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()),
    })
    with pytest.raises(HTTPException) as exc:
        decode_jwt(token, _JWKS_URL)
    assert exc.value.status_code == 401
