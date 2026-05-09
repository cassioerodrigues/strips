from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import Claims
from app.config import get_settings
from app.db import lifespan
from app.deps import get_current_user


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Stirps API", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/healthz")
    def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/_whoami")
    def whoami(user: Claims = Depends(get_current_user)) -> dict:
        return {"sub": str(user.sub), "email": user.email, "role": user.role}

    return app


app = create_app()
