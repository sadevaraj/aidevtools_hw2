from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.board_service import (
    _DELETED_PROJECT_TRASH,
    BoardValidationError,
    create_project,
    create_task,
    delete_project,
    delete_task,
    get_board_snapshot,
    get_display_name_suggestions,
    get_snapshot_payload,
    move_task,
    record_display_name_suggestion,
    rename_project,
    reorder_projects,
    set_project_hidden,
    undo_delete_project,
    update_task,
)
from app.models import DisplayNameSuggestion, Project, Task, TaskStatus


def add_project(
    session,
    project_id: str,
    *,
    name: str = "Project",
    position: int = 0,
    hidden: bool = False,
    created_at: datetime | None = None,
) -> Project:
    project = Project(
        id=project_id,
        name=name,
        position=position,
        hidden=hidden,
        created_at=created_at or datetime.now(timezone.utc),
    )
    session.add(project)
    session.commit()
    return project


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
    created_at: datetime | None = None,
) -> Task:
    task = Task(
        id=task_id,
        project_id=project_id,
        title=title,
        assignee=assignee,
        notes=notes,
        status=status,
        position=position,
        created_at=created_at or datetime.now(timezone.utc),
    )
    session.add(task)
    session.commit()
    return task


@pytest.fixture(autouse=True)
def clear_deleted_project_trash():
    _DELETED_PROJECT_TRASH.clear()
    yield
    _DELETED_PROJECT_TRASH.clear()


def test_get_board_snapshot_returns_openapi_shape(session):
    add_project(
        session,
        "project-b",
        name="Beta",
        position=1,
        created_at=datetime(2024, 1, 2, tzinfo=timezone.utc),
    )
    add_project(
        session,
        "project-a",
        name="Alpha",
        position=0,
        created_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
    )
    add_task(
        session,
        "task-1",
        project_id="project-a",
        status=TaskStatus.DOING,
        position=0,
        created_at=datetime(2024, 1, 3, tzinfo=timezone.utc),
    )
    add_task(
        session,
        "task-2",
        project_id="project-b",
        status=TaskStatus.TODO,
        position=2,
        created_at=datetime(2024, 1, 4, tzinfo=timezone.utc),
    )

    snapshot = get_board_snapshot(session)

    assert list(snapshot) == ["projects", "tasks"]
    assert [project["id"] for project in snapshot["projects"]] == ["project-a", "project-b"]
    assert snapshot["projects"][0] == {
        "id": "project-a",
        "name": "Alpha",
        "position": 0,
        "hidden": False,
        "created_at": "2024-01-01T00:00:00Z",
    }
    assert snapshot["tasks"] == [
        {
            "id": "task-1",
            "project_id": "project-a",
            "title": "Task",
            "assignee": "Casey",
            "notes": "",
            "status": "doing",
            "position": 0,
            "created_at": "2024-01-03T00:00:00Z",
        },
        {
            "id": "task-2",
            "project_id": "project-b",
            "title": "Task",
            "assignee": "Casey",
            "notes": "",
            "status": "todo",
            "position": 2,
            "created_at": "2024-01-04T00:00:00Z",
        },
    ]


def test_get_snapshot_payload_includes_most_recent_display_name_suggestions(session):
    add_project(session, "project-1")
    add_task(session, "task-1", project_id="project-1")

    record_display_name_suggestion(session, "Taylor")
    record_display_name_suggestion(session, "Jordan")

    snapshot = get_snapshot_payload(session)

    assert snapshot == {
        "board": {
            "projects": [
                {
                    "id": "project-1",
                    "name": "Project",
                    "position": 0,
                    "hidden": False,
                    "created_at": snapshot["board"]["projects"][0]["created_at"],
                }
            ],
            "tasks": [
                {
                    "id": "task-1",
                    "project_id": "project-1",
                    "title": "Task",
                    "assignee": "Casey",
                    "notes": "",
                    "status": "todo",
                    "position": 0,
                    "created_at": snapshot["board"]["tasks"][0]["created_at"],
                }
            ],
        },
        "displayNameSuggestions": ["Jordan", "Taylor"],
    }
    assert snapshot["board"]["projects"][0]["created_at"].endswith("Z")
    assert snapshot["board"]["tasks"][0]["created_at"].endswith("Z")


def test_record_display_name_suggestion_trims_dedupes_and_keeps_latest_casing(
    session, monkeypatch
):
    base_time = datetime(2024, 1, 1, tzinfo=timezone.utc)

    import app.board_service as board_service

    monkeypatch.setattr(board_service, "_utc_now", lambda: base_time)
    record_display_name_suggestion(session, "  devaraj  ")
    monkeypatch.setattr(board_service, "_utc_now", lambda: base_time + timedelta(minutes=5))
    record_display_name_suggestion(session, "Devaraj")
    monkeypatch.setattr(board_service, "_utc_now", lambda: base_time + timedelta(minutes=10))
    record_display_name_suggestion(session, "Avery")

    persisted = session.get(DisplayNameSuggestion, "devaraj")
    assert persisted is not None
    assert persisted.display_name == "Devaraj"
    assert persisted.last_used_at.replace(tzinfo=timezone.utc) == base_time + timedelta(minutes=5)
    assert get_display_name_suggestions(session) == ["Avery", "Devaraj"]
    assert list(
        session.scalars(
            select(DisplayNameSuggestion.normalized_name).order_by(
                DisplayNameSuggestion.normalized_name.asc()
            )
        )
    ) == [
        "avery",
        "devaraj",
    ]


def test_record_display_name_suggestion_prunes_to_twenty_most_recent_distinct_names(
    session, monkeypatch
):
    base_time = datetime(2024, 1, 1, tzinfo=timezone.utc)

    import app.board_service as board_service

    for index in range(21):
        monkeypatch.setattr(
            board_service, "_utc_now", lambda index=index: base_time + timedelta(minutes=index)
        )
        record_display_name_suggestion(session, f"User {index:02d}")

    suggestions = get_display_name_suggestions(session)

    assert len(suggestions) == 20
    assert suggestions[0] == "User 20"
    assert suggestions[-1] == "User 01"
    assert session.get(DisplayNameSuggestion, "user 00") is None


@pytest.mark.parametrize("value", [" ", "\n\t", "x" * 51])
def test_record_display_name_suggestion_reuses_existing_validation(session, value):
    with pytest.raises(BoardValidationError):
        record_display_name_suggestion(session, value)

    assert get_display_name_suggestions(session) == []
    assert list(session.scalars(select(DisplayNameSuggestion))) == []


def test_create_project_trims_sets_defaults_and_appends_position(session):
    add_project(session, "project-1", name="Existing", position=0)

    project = create_project(session, "  New Project  ")

    persisted = session.get(Project, project["id"])
    assert persisted is not None
    assert project["name"] == "New Project"
    assert project["hidden"] is False
    assert project["position"] == 1
    assert project["created_at"].endswith("Z")
    assert persisted.name == "New Project"
    assert persisted.position == 1


def test_rename_project_changes_only_name(session):
    original_created_at = datetime(2024, 1, 1, tzinfo=timezone.utc)
    add_project(
        session,
        "project-1",
        name="Original",
        position=4,
        hidden=True,
        created_at=original_created_at,
    )

    renamed = rename_project(session, "project-1", "  Renamed  ")

    assert renamed["name"] == "Renamed"
    persisted = session.get(Project, "project-1")
    assert persisted is not None
    assert persisted.name == "Renamed"
    assert persisted.position == 4
    assert persisted.hidden is True
    assert persisted.created_at.replace(tzinfo=timezone.utc) == original_created_at


def test_delete_project_cascades_and_undo_restores_project_and_tasks(session):
    add_project(session, "project-1", name="Project 1", position=1, hidden=True)
    add_task(session, "task-1", project_id="project-1", status=TaskStatus.TODO, position=0)
    add_task(session, "task-2", project_id="project-1", status=TaskStatus.DONE, position=3)

    delete_project(session, "project-1")

    assert session.get(Project, "project-1") is None
    assert session.get(Task, "task-1") is None
    assert session.get(Task, "task-2") is None
    assert "project-1" in _DELETED_PROJECT_TRASH

    undo_delete_project(session, "project-1")

    restored_project = session.get(Project, "project-1")
    restored_tasks = list(
        session.scalars(select(Task).where(Task.project_id == "project-1").order_by(Task.id))
    )
    assert restored_project is not None
    assert restored_project.hidden is True
    assert [(task.id, task.status, task.position) for task in restored_tasks] == [
        ("task-1", TaskStatus.TODO, 0),
        ("task-2", TaskStatus.DONE, 3),
    ]
    assert "project-1" not in _DELETED_PROJECT_TRASH


def test_undo_delete_project_raises_when_missing_or_expired(session, monkeypatch):
    with pytest.raises(BoardValidationError) as missing_error:
        undo_delete_project(session, "missing")

    assert missing_error.value.code == "nothing_to_undo"
    assert missing_error.value.message == "Nothing to undo"

    add_project(session, "project-1")
    delete_project(session, "project-1")

    base_time = datetime(2024, 1, 1, tzinfo=timezone.utc)

    import app.board_service as board_service

    monkeypatch.setattr(board_service, "_utc_now", lambda: base_time)
    _DELETED_PROJECT_TRASH["project-1"]["deleted_at"] = base_time
    monkeypatch.setattr(
        board_service,
        "_utc_now",
        lambda: base_time + timedelta(seconds=board_service.UNDO_DELETE_TTL_SECONDS, microseconds=1),
    )

    with pytest.raises(BoardValidationError) as expired_error:
        undo_delete_project(session, "project-1")

    assert expired_error.value.code == "nothing_to_undo"
    assert expired_error.value.message == "Nothing to undo"
    assert session.get(Project, "project-1") is None


def test_set_project_hidden_show_and_hide_only_changes_hidden(session):
    add_project(session, "project-1", name="Project 1", position=2, hidden=False)

    hidden = set_project_hidden(session, "project-1", True)
    shown = set_project_hidden(session, "project-1", False)

    assert hidden["hidden"] is True
    assert shown["hidden"] is False
    persisted = session.get(Project, "project-1")
    assert persisted is not None
    assert persisted.name == "Project 1"
    assert persisted.position == 2
    assert persisted.hidden is False


def test_reorder_projects_requires_each_project_once_and_reindexes(session):
    add_project(session, "project-1", position=0)
    add_project(session, "project-2", position=1)
    add_project(session, "project-3", position=2)

    reorder_projects(session, ["project-3", "project-1", "project-2"])

    reordered = list(session.scalars(select(Project).order_by(Project.position.asc())))
    assert [(project.id, project.position) for project in reordered] == [
        ("project-3", 0),
        ("project-1", 1),
        ("project-2", 2),
    ]

    with pytest.raises(BoardValidationError) as duplicate_error:
        reorder_projects(session, ["project-3", "project-1", "project-1"])

    assert duplicate_error.value.code == "invalid_project_id"
    assert duplicate_error.value.message == "Invalid project"


def test_reorder_projects_is_atomic_on_validation_failure(session):
    add_project(session, "project-1", position=0)
    add_project(session, "project-2", position=1)

    before = [(project.id, project.position) for project in session.scalars(select(Project).order_by(Project.id))]

    with pytest.raises(BoardValidationError):
        reorder_projects(session, ["project-2", "missing"])

    after = [(project.id, project.position) for project in session.scalars(select(Project).order_by(Project.id))]
    assert after == before


def test_create_task_validates_defaults_and_uses_todo_count_for_position(session):
    add_project(session, "project-1")
    add_task(session, "task-1", project_id="project-1", status=TaskStatus.TODO, position=0)
    add_task(session, "task-2", project_id="project-1", status=TaskStatus.DOING, position=5)

    task = create_task(
        session,
        "project-1",
        "  New Task  ",
        "  Casey  ",
        "  preserve surrounding spaces  ",
    )

    persisted = session.get(Task, task["id"])
    assert persisted is not None
    assert task["title"] == "New Task"
    assert task["assignee"] == "Casey"
    assert task["notes"] == "  preserve surrounding spaces  "
    assert task["status"] == "todo"
    assert task["position"] == 1
    assert persisted.position == 1

    default_notes_task = create_task(session, "project-1", "Another", "Jordan")
    assert default_notes_task["notes"] == ""


def test_update_task_only_changes_provided_patchable_fields(session):
    add_project(session, "project-1")
    add_task(
        session,
        "task-1",
        project_id="project-1",
        title="Original",
        assignee="Casey",
        notes="original",
        status=TaskStatus.DOING,
        position=2,
    )

    updated = update_task(
        session,
        "task-1",
        {
            "title": "  Updated Title  ",
            "notes": "  keep whitespace  ",
            "status": "done",
        },
    )

    persisted = session.get(Task, "task-1")
    assert updated["title"] == "Updated Title"
    assert updated["notes"] == "  keep whitespace  "
    assert persisted is not None
    assert persisted.title == "Updated Title"
    assert persisted.assignee == "Casey"
    assert persisted.notes == "  keep whitespace  "
    assert persisted.status == TaskStatus.DOING
    assert persisted.position == 2


def test_delete_task_deletes_only_target_task(session):
    add_project(session, "project-1")
    add_task(session, "task-1", project_id="project-1")
    add_task(session, "task-2", project_id="project-1")

    delete_task(session, "task-1")

    assert session.get(Task, "task-1") is None
    assert session.get(Task, "task-2") is not None


def test_move_task_within_same_column_reindexes_contiguously(session):
    add_project(session, "project-1")
    add_task(session, "task-1", project_id="project-1", status=TaskStatus.TODO, position=0)
    add_task(session, "task-2", project_id="project-1", status=TaskStatus.TODO, position=1)
    add_task(session, "task-3", project_id="project-1", status=TaskStatus.TODO, position=2)

    moved = move_task(session, "task-1", "project-1", "todo", 2)

    assert moved["project_id"] == "project-1"
    assert moved["status"] == "todo"
    assert moved["position"] == 2
    column = list(
        session.scalars(
            select(Task)
            .where(Task.project_id == "project-1", Task.status == TaskStatus.TODO)
            .order_by(Task.position.asc())
        )
    )
    assert [(task.id, task.position) for task in column] == [
        ("task-2", 0),
        ("task-3", 1),
        ("task-1", 2),
    ]


def test_move_task_across_columns_reindexes_source_and_destination(session):
    add_project(session, "project-1")
    add_task(session, "task-1", project_id="project-1", status=TaskStatus.TODO, position=0)
    add_task(session, "task-2", project_id="project-1", status=TaskStatus.TODO, position=1)
    add_task(session, "task-3", project_id="project-1", status=TaskStatus.DOING, position=0)
    add_task(session, "task-4", project_id="project-1", status=TaskStatus.DOING, position=1)

    moved = move_task(session, "task-2", "project-1", "doing", -5)

    todo_column = list(
        session.scalars(
            select(Task)
            .where(Task.project_id == "project-1", Task.status == TaskStatus.TODO)
            .order_by(Task.position.asc())
        )
    )
    doing_column = list(
        session.scalars(
            select(Task)
            .where(Task.project_id == "project-1", Task.status == TaskStatus.DOING)
            .order_by(Task.position.asc())
        )
    )
    assert moved["project_id"] == "project-1"
    assert moved["status"] == "doing"
    assert moved["position"] == 0
    assert [(task.id, task.position) for task in todo_column] == [("task-1", 0)]
    assert [(task.id, task.position) for task in doing_column] == [
        ("task-2", 0),
        ("task-3", 1),
        ("task-4", 2),
    ]


def test_move_task_across_projects_clamps_destination_index(session):
    add_project(session, "project-1")
    add_project(session, "project-2")
    add_task(session, "task-1", project_id="project-1", status=TaskStatus.DONE, position=0)
    add_task(session, "task-2", project_id="project-2", status=TaskStatus.DONE, position=0)

    moved = move_task(session, "task-1", "project-2", "done", 99)

    project_one_done = list(
        session.scalars(
            select(Task)
            .where(Task.project_id == "project-1", Task.status == TaskStatus.DONE)
            .order_by(Task.position.asc())
        )
    )
    project_two_done = list(
        session.scalars(
            select(Task)
            .where(Task.project_id == "project-2", Task.status == TaskStatus.DONE)
            .order_by(Task.position.asc())
        )
    )
    assert moved["project_id"] == "project-2"
    assert moved["status"] == "done"
    assert moved["position"] == 1
    assert project_one_done == []
    assert [(task.id, task.position) for task in project_two_done] == [
        ("task-2", 0),
        ("task-1", 1),
    ]


@pytest.mark.parametrize(
    ("call", "code", "message"),
    [
        (lambda session: create_project(session, "   "), "invalid_project_name", "Invalid project name"),
        (
            lambda session: create_project(session, "x" * 51),
            "project_name_too_long",
            "project name is too long",
        ),
        (
            lambda session: rename_project(session, "missing", "Name"),
            "invalid_project_id",
            "Invalid project",
        ),
        (
            lambda session: set_project_hidden(session, "missing", True),
            "invalid_project_id",
            "Invalid project",
        ),
        (
            lambda session: create_task(session, "missing", "Task", "Casey"),
            "invalid_project_id",
            "Invalid project",
        ),
        (
            lambda session: create_task(session, "project-1", " ", "Casey"),
            "invalid_task_title",
            "Invalid task title",
        ),
        (
            lambda session: create_task(session, "project-1", "x" * 101, "Casey"),
            "task_title_too_long",
            "task title is too long",
        ),
        (
            lambda session: create_task(session, "project-1", "Task", " "),
            "invalid_assignee",
            "Invalid assignee",
        ),
        (
            lambda session: create_task(session, "project-1", "Task", "x" * 51),
            "assignee_too_long",
            "assignee is too long",
        ),
        (
            lambda session: create_task(session, "project-1", "Task", "Casey", "x" * 2001),
            "notes_too_long",
            "notes is too long",
        ),
        (
            lambda session: update_task(session, "missing", {"title": "Task"}),
            "invalid_task_id",
            "Invalid task",
        ),
        (
            lambda session: move_task(session, "task-1", "project-1", "blocked", 0),
            "invalid_status",
            "Invalid status",
        ),
        (
            lambda session: delete_task(session, "missing"),
            "invalid_task_id",
            "Invalid task",
        ),
        (
            lambda session: delete_project(session, "missing"),
            "invalid_project_id",
            "Invalid project",
        ),
    ],
)
def test_validation_errors_return_stable_codes_and_messages(session, call, code, message):
    add_project(session, "project-1")
    add_task(session, "task-1", project_id="project-1")

    with pytest.raises(BoardValidationError) as error:
        call(session)

    assert error.value.code == code
    assert error.value.message == message
