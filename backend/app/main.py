from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from .database import init_database


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_database()
    yield


app = FastAPI(title="Project Board Backend", lifespan=lifespan)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
