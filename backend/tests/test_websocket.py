from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.board_service import _DELETED_PROJECT_TRASH
from app.database import create_database_engine, create_session_factory, init_database
from app.main import app
from app.models import DisplayNameSuggestion, Project, Task, TaskStatus
from app.websocket import manager


def add_project(
    session,
    project_id: str,
    *,
    name: str = "Project",
    position: int = 0,
    hidden: bool = False,
) -> None:
    session.add(
        Project(
            id=project_id,
            name=name,
            position=position,
            hidden=hidden,
            created_at=datetime.now(timezone.utc),
        )
    )
    session.commit()


def add_task(
    session,
    task_id: str,
    *,
    project_id: str,
    title: str = "Task",
    assignee: str = "Casey",
    notes: str = "",
    status: TaskStatus = TaskStatus.TODO,
    position: int = 0,
) -> None:
    session.add(
        Task(
            id=task_id,
            project_id=project_id,
            title=title,
            assignee=assignee,
            notes=notes,
            status=status,
            position=position,
            created_at=datetime.now(timezone.utc),
        )
    )
    session.commit()


@pytest.fixture
def client(tmp_path):
    database_file = tmp_path / "websocket.db"
    engine = create_database_engine(f"sqlite:///{database_file}")
    init_database(engine)
    Session = create_session_factory(engine)

    original_engine = app.state.db_engine
    original_factory = app.state.session_factory

    app.state.db_engine = engine
    app.state.session_factory = Session
    manager.reset()
    _DELETED_PROJECT_TRASH.clear()

    try:
        with TestClient(app) as test_client:
            yield test_client, Session
    finally:
        manager.reset()
        _DELETED_PROJECT_TRASH.clear()
        app.state.db_engine = original_engine
        app.state.session_factory = original_factory
        engine.dispose()


def test_websocket_connect_sends_initial_snapshot(client):
    test_client, _Session = client

    with test_client.websocket_connect("/ws") as websocket:
        message = websocket.receive_json()

    assert message == {
        "type": "snapshot",
        "payload": {"board": {"projects": [], "tasks": []}, "displayNameSuggestions": []},
    }


def test_successful_command_returns_command_ok_and_broadcasts_board_event(client):
    test_client, Session = client

    with test_client.websocket_connect("/ws") as requester:
        requester.receive_json()
        with test_client.websocket_connect("/ws") as observer:
            observer.receive_json()

            requester.send_json(
                {
                    "type": "create_project",
                    "requestId": "req-create-project",
                    "payload": {"name": "Roadmap"},
                }
            )

            command_ok = requester.receive_json()
            requester_event = requester.receive_json()
            observer_event = observer.receive_json()

    assert command_ok["type"] == "command_ok"
    assert command_ok["requestId"] == "req-create-project"
    project = command_ok["payload"]["project"]
    assert project["name"] == "Roadmap"
    assert requester_event == observer_event == {
        "type": "board_event",
        "payload": {"eventType": "project_created", "project": project},
    }

    with Session() as session:
        persisted = session.get(Project, project["id"])
        assert persisted is not None
        assert persisted.name == "Roadmap"


def test_validation_failure_returns_requester_only_command_error(client):
    test_client, Session = client

    with test_client.websocket_connect("/ws") as requester:
        requester.receive_json()
        with test_client.websocket_connect("/ws") as observer:
            observer.receive_json()

            requester.send_json(
                {
                    "type": "create_project",
                    "requestId": "req-invalid-project",
                    "payload": {"name": "   "},
                }
            )

            command_error = requester.receive_json()
            observer.send_json(
                {
                    "type": "create_project",
                    "requestId": "req-valid-project",
                    "payload": {"name": "Valid Project"},
                }
            )

            observer_command_ok = observer.receive_json()
            observer_board_event = observer.receive_json()

    assert command_error == {
        "type": "command_error",
        "requestId": "req-invalid-project",
        "payload": {
            "code": "invalid_project_name",
            "message": "Invalid project name",
        },
    }
    assert observer_command_ok["type"] == "command_ok"
    assert observer_command_ok["requestId"] == "req-valid-project"
    assert observer_board_event == {
        "type": "board_event",
        "payload": {
            "eventType": "project_created",
            "project": observer_command_ok["payload"]["project"],
        },
    }

    with Session() as session:
        projects = list(session.scalars(select(Project).order_by(Project.name.asc())))
        assert [project.name for project in projects] == ["Valid Project"]


def test_set_editing_broadcasts_presence_and_disconnect_clears_it(client):
    test_client, Session = client

    with Session() as session:
        add_project(session, "project-1")
        add_task(session, "task-1", project_id="project-1")

    with test_client.websocket_connect("/ws") as observer:
        observer.receive_json()
        with test_client.websocket_connect("/ws") as editor:
            editor.receive_json()

            editor.send_json(
                {
                    "type": "set_editing",
                    "requestId": "req-editing",
                    "payload": {"taskId": "task-1", "displayName": " Avery "},
                }
            )

            expected_presence = {
                "type": "presence",
                "payload": {"editing": {"task-1": "Avery"}},
            }
            assert editor.receive_json() == expected_presence
            assert observer.receive_json() == expected_presence

        assert observer.receive_json() == {
            "type": "presence",
            "payload": {"editing": {}},
        }

    with Session() as session:
        suggestion = session.get(DisplayNameSuggestion, "avery")
        assert suggestion is not None
        assert suggestion.display_name == "Avery"


def test_set_editing_only_persists_valid_task_scoped_display_name_suggestions(client):
    test_client, Session = client

    with Session() as session:
        add_project(session, "project-1")
        add_task(session, "task-1", project_id="project-1")

    with test_client.websocket_connect("/ws") as editor:
        editor.receive_json()

        editor.send_json(
            {
                "type": "set_editing",
                "requestId": "req-valid-editing",
                "payload": {"taskId": "task-1", "displayName": "Taylor"},
            }
        )
        assert editor.receive_json() == {
            "type": "presence",
            "payload": {"editing": {"task-1": "Taylor"}},
        }

        editor.send_json(
            {
                "type": "set_editing",
                "requestId": "req-clear-editing",
                "payload": {"taskId": None, "displayName": "Taylor"},
            }
        )
        assert editor.receive_json() == {
            "type": "presence",
            "payload": {"editing": {}},
        }

        editor.send_json(
            {
                "type": "set_editing",
                "requestId": "req-blank-editing",
                "payload": {"taskId": "task-1", "displayName": "   "},
            }
        )

        editor.send_json(
            {
                "type": "set_editing",
                "requestId": "req-long-editing",
                "payload": {"taskId": "task-1", "displayName": "x" * 51},
            }
        )

    with Session() as session:
        suggestions = list(
            session.scalars(
                select(DisplayNameSuggestion).order_by(DisplayNameSuggestion.last_used_at.desc())
            )
        )
        assert [suggestion.display_name for suggestion in suggestions] == ["Taylor"]

    with test_client.websocket_connect("/ws") as refreshed_client:
        snapshot = refreshed_client.receive_json()

    assert snapshot["type"] == "snapshot"
    assert snapshot["payload"]["displayNameSuggestions"] == ["Taylor"]
    assert snapshot["payload"]["board"]["projects"][0]["id"] == "project-1"
    assert snapshot["payload"]["board"]["tasks"][0]["id"] == "task-1"


def test_set_editing_without_request_id_is_ignored(client):
    test_client, Session = client

    with Session() as session:
        add_project(session, "project-1")
        add_task(session, "task-1", project_id="project-1")

    with test_client.websocket_connect("/ws") as observer:
        observer.receive_json()
        with test_client.websocket_connect("/ws") as editor:
            editor.receive_json()

            editor.send_json(
                {
                    "type": "set_editing",
                    "payload": {"taskId": "task-1", "displayName": "Avery"},
                }
            )

            observer.send_json(
                {
                    "type": "create_project",
                    "requestId": "req-after-invalid-editing",
                    "payload": {"name": "Roadmap"},
                }
            )

            observer_command_ok = observer.receive_json()
            observer_board_event = observer.receive_json()
            editor_board_event = editor.receive_json()

    assert observer_command_ok["type"] == "command_ok"
    assert observer_command_ok["requestId"] == "req-after-invalid-editing"
    assert observer_board_event == editor_board_event == {
        "type": "board_event",
        "payload": {
            "eventType": "project_created",
            "project": observer_command_ok["payload"]["project"],
        },
    }
    assert manager.presence_message() == {
        "type": "presence",
        "payload": {"editing": {}},
    }


def test_duplicate_request_id_reuses_cached_result_without_rebroadcast(client):
    test_client, Session = client

    with test_client.websocket_connect("/ws") as requester:
        requester.receive_json()
        with test_client.websocket_connect("/ws") as observer:
            observer.receive_json()

            command = {
                "type": "create_project",
                "requestId": "req-duplicate",
                "payload": {"name": "Idempotent"},
            }
            requester.send_json(command)

            first_response = requester.receive_json()
            requester.receive_json()
            observer.receive_json()

            requester.send_json(command)
            second_response = requester.receive_json()

            observer.send_json(
                {
                    "type": "create_project",
                    "requestId": "req-follow-up",
                    "payload": {"name": "Follow Up"},
                }
            )

            follow_up_command_ok = observer.receive_json()

    assert second_response == first_response
    assert follow_up_command_ok["type"] == "command_ok"
    assert follow_up_command_ok["requestId"] == "req-follow-up"

    with Session() as session:
        projects = list(session.scalars(select(Project).order_by(Project.name.asc())))
        assert [project.name for project in projects] == ["Follow Up", "Idempotent"]


def test_duplicate_request_id_across_reconnect_reuses_cached_command_ok(client):
    test_client, Session = client

    with test_client.websocket_connect("/ws") as observer:
        observer.receive_json()
        with test_client.websocket_connect("/ws") as requester:
            requester.receive_json()

            command = {
                "type": "create_project",
                "requestId": "req-reconnect",
                "payload": {"name": "Reconnect Safe"},
            }
            requester.send_json(command)

            first_response = requester.receive_json()
            requester.receive_json()
            observer.receive_json()

        with test_client.websocket_connect("/ws") as retried_requester:
            retried_requester.receive_json()
            retried_requester.send_json(command)
            second_response = retried_requester.receive_json()

            observer.send_json(
                {
                    "type": "create_project",
                    "requestId": "req-follow-up-reconnect",
                    "payload": {"name": "Follow Up"},
                }
            )
            follow_up_command_ok = observer.receive_json()

    assert second_response == first_response
    assert follow_up_command_ok["type"] == "command_ok"
    assert follow_up_command_ok["requestId"] == "req-follow-up-reconnect"

    with Session() as session:
        projects = list(session.scalars(select(Project).order_by(Project.name.asc())))
        assert [project.name for project in projects] == ["Follow Up", "Reconnect Safe"]


def test_duplicate_request_id_across_reconnect_reuses_cached_command_error(client):
    test_client, Session = client

    command = {
        "type": "create_project",
        "requestId": "req-reconnect-error",
        "payload": {"name": "   "},
    }

    with test_client.websocket_connect("/ws") as requester:
        requester.receive_json()
        requester.send_json(command)
        first_response = requester.receive_json()

    with test_client.websocket_connect("/ws") as retried_requester:
        retried_requester.receive_json()
        retried_requester.send_json(command)
        second_response = retried_requester.receive_json()

    assert second_response == first_response == {
        "type": "command_error",
        "requestId": "req-reconnect-error",
        "payload": {
            "code": "invalid_project_name",
            "message": "Invalid project name",
        },
    }

    with Session() as session:
        projects = list(session.scalars(select(Project)))
        assert projects == []


def test_reusing_request_id_with_different_payload_returns_conflict_and_keeps_original_cache(
    client,
):
    test_client, Session = client

    original_command = {
        "type": "create_project",
        "requestId": "req-conflict-payload",
        "payload": {"name": "Original"},
    }

    with test_client.websocket_connect("/ws") as observer:
        observer.receive_json()
        with test_client.websocket_connect("/ws") as requester:
            requester.receive_json()
            requester.send_json(original_command)
            first_response = requester.receive_json()
            requester.receive_json()
            observer.receive_json()

        with test_client.websocket_connect("/ws") as retried_requester:
            retried_requester.receive_json()
            retried_requester.send_json(
                {
                    "type": "create_project",
                    "requestId": "req-conflict-payload",
                    "payload": {"name": "Different"},
                }
            )
            assert retried_requester.receive_json() == {
                "type": "command_error",
                "requestId": "req-conflict-payload",
                "payload": {
                    "code": "request_id_conflict",
                    "message": "requestId was already used for a different logical command",
                },
            }

        with test_client.websocket_connect("/ws") as original_retry:
            original_retry.receive_json()
            original_retry.send_json(original_command)
            assert original_retry.receive_json() == first_response

            observer.send_json(
                {
                    "type": "create_project",
                    "requestId": "req-after-conflict",
                    "payload": {"name": "Follow Up"},
                }
            )
            follow_up_command_ok = observer.receive_json()

    assert follow_up_command_ok["type"] == "command_ok"
    assert follow_up_command_ok["requestId"] == "req-after-conflict"

    with Session() as session:
        projects = list(session.scalars(select(Project).order_by(Project.name.asc())))
        assert [project.name for project in projects] == ["Follow Up", "Original"]


def test_reusing_request_id_with_different_command_type_returns_conflict(client):
    test_client, Session = client

    with test_client.websocket_connect("/ws") as requester:
        requester.receive_json()
        requester.send_json(
            {
                "type": "create_project",
                "requestId": "req-conflict-command",
                "payload": {"name": "Roadmap"},
            }
        )
        create_response = requester.receive_json()
        requester.receive_json()
        project_id = create_response["payload"]["project"]["id"]

    with test_client.websocket_connect("/ws") as retried_requester:
        retried_requester.receive_json()
        retried_requester.send_json(
            {
                "type": "delete_project",
                "requestId": "req-conflict-command",
                "payload": {"id": project_id},
            }
        )
        assert retried_requester.receive_json() == {
            "type": "command_error",
            "requestId": "req-conflict-command",
            "payload": {
                "code": "request_id_conflict",
                "message": "requestId was already used for a different logical command",
            },
        }

    with Session() as session:
        projects = list(session.scalars(select(Project)))
        assert [project.id for project in projects] == [project_id]


def test_request_id_cache_expires_after_retry_window(client, monkeypatch):
    test_client, Session = client

    fake_now = 1_000.0
    monkeypatch.setattr(manager, "_now", lambda: fake_now)

    command = {
        "type": "create_project",
        "requestId": "req-expired",
        "payload": {"name": "Expires"},
    }

    with test_client.websocket_connect("/ws") as requester:
        requester.receive_json()
        requester.send_json(command)
        requester.receive_json()
        requester.receive_json()

        fake_now += manager.retry_window_seconds + 1

        requester.send_json(command)
        requester.receive_json()
        requester.receive_json()

    with Session() as session:
        projects = list(session.scalars(select(Project).order_by(Project.created_at.asc())))
        assert [project.name for project in projects] == ["Expires", "Expires"]


def test_request_id_cache_evicts_oldest_entry_when_capacity_is_exceeded(client, monkeypatch):
    test_client, Session = client

    fake_now = 2_000.0
    monkeypatch.setattr(manager, "_now", lambda: fake_now)
    monkeypatch.setattr(manager, "cache_size", 2)

    with test_client.websocket_connect("/ws") as requester:
        requester.receive_json()

        for request_id, name in (
            ("req-oldest", "Oldest"),
            ("req-middle", "Middle"),
            ("req-newest", "Newest"),
        ):
            requester.send_json(
                {
                    "type": "create_project",
                    "requestId": request_id,
                    "payload": {"name": name},
                }
            )
            requester.receive_json()
            requester.receive_json()
            fake_now += 1

        requester.send_json(
            {
                "type": "create_project",
                "requestId": "req-oldest",
                "payload": {"name": "Oldest"},
            }
        )
        requester.receive_json()
        requester.receive_json()

    with Session() as session:
        projects = list(session.scalars(select(Project).order_by(Project.created_at.asc())))
        assert [project.name for project in projects] == [
            "Oldest",
            "Middle",
            "Newest",
            "Oldest",
        ]
