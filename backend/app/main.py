from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from .database import SessionLocal, engine, init_database
from .websocket import router as websocket_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_database(app.state.db_engine)
    yield


app = FastAPI(title="Project Board Backend", lifespan=lifespan)
app.state.db_engine = engine
app.state.session_factory = SessionLocal
app.include_router(websocket_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
