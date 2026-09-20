from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import sessionmaker

BACKEND_DIR = Path(__file__).resolve().parents[1]
def resolve_database_url(explicit_url: str | None = None) -> str:
    if explicit_url:
        return explicit_url

    database_url = os.getenv("SDIP_DATABASE_URL") or os.getenv("DATABASE_URL")
    if database_url:
        return database_url

    raise RuntimeError(
        "Database URL is not configured. Set SDIP_DATABASE_URL or DATABASE_URL."
    )


def _ensure_sqlite_directory(database_url: str) -> None:
    url = make_url(database_url)
    if url.drivername != "sqlite" or not url.database or url.database == ":memory:":
        return

    db_path = Path(url.database).expanduser()
    if not db_path.is_absolute():
        db_path = Path.cwd() / db_path
    db_path.parent.mkdir(parents=True, exist_ok=True)


def create_database_engine(database_url: str | None = None) -> Engine:
    resolved_url = resolve_database_url(database_url)
    _ensure_sqlite_directory(resolved_url)

    engine = create_engine(
        resolved_url,
        connect_args={"check_same_thread": False}
        if make_url(resolved_url).drivername == "sqlite"
        else {},
    )

    if make_url(resolved_url).drivername == "sqlite":

        @event.listens_for(engine, "connect")
        def _set_sqlite_pragma(dbapi_connection, _connection_record) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


def create_session_factory(bind: Engine | None = None) -> sessionmaker:
    return sessionmaker(bind=bind or engine, autoflush=False, expire_on_commit=False)


engine = create_database_engine()
SessionLocal = create_session_factory(engine)


def init_database(target_engine: Engine | None = None) -> None:
    from .models import Base

    Base.metadata.create_all(bind=target_engine or engine)
