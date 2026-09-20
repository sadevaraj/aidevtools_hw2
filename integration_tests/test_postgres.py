from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, inspect, select

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPOSITORY_ROOT / "backend"))


DATABASE_URL = os.getenv("SDIP_DATABASE_URL")


@pytest.fixture(scope="module")
def postgres_engine():
    if not DATABASE_URL:
        pytest.skip("SDIP_DATABASE_URL is not set")
    if not DATABASE_URL.startswith(("postgresql://", "postgresql+psycopg://")):
        pytest.skip("SDIP_DATABASE_URL does not point to PostgreSQL")

    from app.database import create_database_engine, init_database

    engine = create_database_engine(DATABASE_URL)
    try:
        init_database(engine)
        yield engine
    finally:
        engine.dispose()


def test_postgres_schema_is_available(postgres_engine):
    tables = set(inspect(postgres_engine).get_table_names())
    assert {"projects", "tasks", "display_name_suggestions"}.issubset(tables)


@pytest.fixture(scope="module")
def e2e_client(postgres_engine):
    from app.board_service import _DELETED_PROJECT_TRASH
    from app.main import app
    from app.models import Project, Task
    from app.websocket import manager
    from app.database import create_session_factory

    session_factory = create_session_factory(postgres_engine)
    original_engine = app.state.db_engine
    original_factory = app.state.session_factory
    app.state.db_engine = postgres_engine
    app.state.session_factory = session_factory
    manager.reset()
    _DELETED_PROJECT_TRASH.clear()

    try:
        with TestClient(app) as client:
            yield client, session_factory
    finally:
        manager.reset()
        _DELETED_PROJECT_TRASH.clear()
        with session_factory() as session:
            session.execute(
                delete(Task).where(Task.title == "Verify PostgreSQL persistence")
            )
            session.execute(delete(Project).where(Project.name == "Integration project"))
            session.commit()
        app.state.db_engine = original_engine
        app.state.session_factory = original_factory


def receive_command_result(websocket):
    command_ok = websocket.receive_json()
    board_event = websocket.receive_json()
    return command_ok, board_event


def test_health_endpoint_is_available(e2e_client):
    client, _session_factory = e2e_client

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_websocket_create_project_and_task_persist_across_reconnect(e2e_client):
    client, session_factory = e2e_client

    with client.websocket_connect("/ws") as websocket:
        assert websocket.receive_json()["type"] == "snapshot"

        websocket.send_json(
            {
                "type": "create_project",
                "requestId": "e2e-create-project",
                "payload": {"name": "Integration project"},
            }
        )
        project_result, project_event = receive_command_result(websocket)
        project = project_result["payload"]["project"]

        assert project_result["type"] == "command_ok"
        assert project_event["payload"]["eventType"] == "project_created"

        websocket.send_json(
            {
                "type": "create_task",
                "requestId": "e2e-create-task",
                "payload": {
                    "project_id": project["id"],
                    "title": "Verify PostgreSQL persistence",
                    "assignee": "Integration Tester",
                    "notes": "Created through the WebSocket API",
                },
            }
        )
        task_result, task_event = receive_command_result(websocket)
        task = task_result["payload"]["task"]

        assert task_result["type"] == "command_ok"
        assert task["project_id"] == project["id"]
        assert task_event["payload"]["eventType"] == "task_created"

    with client.websocket_connect("/ws") as websocket:
        snapshot = websocket.receive_json()

    assert snapshot["type"] == "snapshot"
    assert snapshot["payload"]["board"]["projects"] == [project]
    assert snapshot["payload"]["board"]["tasks"] == [task]

    from app.models import Project, Task

    with session_factory() as session:
        assert session.scalar(select(Project).where(Project.id == project["id"])) is not None
        assert session.scalar(select(Task).where(Task.id == task["id"])) is not None


def test_websocket_validation_error_does_not_write_to_database(e2e_client):
    client, session_factory = e2e_client

    with client.websocket_connect("/ws") as websocket:
        websocket.receive_json()
        websocket.send_json(
            {
                "type": "create_project",
                "requestId": "e2e-invalid-project",
                "payload": {"name": "   "},
            }
        )

        response = websocket.receive_json()

    assert response == {
        "type": "command_error",
        "requestId": "e2e-invalid-project",
        "payload": {
            "code": "invalid_project_name",
            "message": "Invalid project name",
        },
    }

    from app.models import Project

    with session_factory() as session:
        assert session.scalar(select(Project).where(Project.name == "   ")) is None
