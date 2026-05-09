from dataclasses import dataclass
from uuid import UUID

import jwt
from fastapi import HTTPException, status


@dataclass(frozen=True)
class Claims:
    sub: UUID
    email: str | None
    role: str


def decode_jwt(token: str, secret: str) -> Claims:
    """Validate a Supabase JWT (HS256) and return its claims.

    Supabase issues HS256 tokens with the project JWT secret. We verify
    signature + exp; we do not verify aud (Supabase puts "authenticated"
    there but it carries no extra security guarantee for our case).
    """
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired")
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
