from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.database import create_database_engine, create_session_factory, init_database


def sqlite_file_url(db_path: Path) -> str:
    return f"sqlite:///{db_path}"


@pytest.fixture
def session(tmp_path):
    database_file = tmp_path / "test.db"
    engine = create_database_engine(sqlite_file_url(database_file))
    init_database(engine)
    Session = create_session_factory(engine)

    session = Session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()
