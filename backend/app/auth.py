from dataclasses import dataclass
from uuid import UUID

import jwt
from fastapi import HTTPException, status
from jwt import PyJWKClient, PyJWKClientError


@dataclass(frozen=True)
class Claims:
    sub: UUID
    email: str | None
    role: str


# Cache de PyJWKClient por processo. PyJWKClient já mantém um cache interno
# de chaves (com refetch automático em kid-miss e TTL); aqui só guardamos a
# instância para reusar entre requisições.
_jwk_client: PyJWKClient | None = None


def _get_jwk_client(jwks_url: str) -> PyJWKClient:
    global _jwk_client
    if _jwk_client is None or _jwk_client.uri != jwks_url:
        _jwk_client = PyJWKClient(jwks_url, cache_keys=True, lifespan=3600)
    return _jwk_client


def decode_jwt(token: str, jwks_url: str) -> Claims:
    """Valida um JWT do Supabase (ES256) usando a JWKS pública.

    O Supabase Cloud emite tokens ES256 assinados com chaves rotativas; a
    chave pública correspondente está em
    `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`. Selecionamos a chave
    pelo header `kid` do token. Verificamos assinatura + exp; não
    verificamos `aud` (Supabase põe "authenticated" lá mas não traz
    garantia extra de segurança no nosso caso).
    """
    client = _get_jwk_client(jwks_url)
    try:
        signing_key = client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            options={"verify_aud": False},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired")
    except PyJWKClientError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Cannot verify token: {exc}")
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {exc}")

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token missing sub claim")
    try:
        sub_uuid = UUID(sub)
    except (TypeError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid sub claim")

    return Claims(
        sub=sub_uuid,
        email=payload.get("email"),
        role=payload.get("role", "authenticated"),
    )
