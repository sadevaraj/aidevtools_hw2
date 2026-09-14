from __future__ import annotations

from collections.abc import Callable, Mapping
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Project, Task, TaskStatus

PROJECT_NAME_MAX_LENGTH = 50
TASK_TITLE_MAX_LENGTH = 100
ASSIGNEE_MAX_LENGTH = 50
NOTES_MAX_LENGTH = 2000
UNDO_DELETE_TTL_SECONDS = 6


class BoardValidationError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


# Intentionally process-local in-memory undo cache to match issue #3 semantics.
_DELETED_PROJECT_TRASH: dict[str, dict[str, Any]] = {}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _serialize_datetime(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _serialize_project(project: Project) -> dict[str, Any]:
    return {
        "id": project.id,
        "name": project.name,
        "position": project.position,
        "hidden": project.hidden,
        "created_at": _serialize_datetime(project.created_at),
    }


def _serialize_task(task: Task) -> dict[str, Any]:
    return {
        "id": task.id,
        "project_id": task.project_id,
        "title": task.title,
        "assignee": task.assignee,
        "notes": task.notes,
        "status": task.status.value,
        "position": task.position,
        "created_at": _serialize_datetime(task.created_at),
    }


def _run_in_transaction(session: Session, operation: Callable[[], Any]) -> Any:
    try:
        result = operation()
        session.commit()
        return result
    except Exception:
        session.rollback()
        raise


def _require_text(
    value: Any,
    *,
    label: str,
    invalid_code: str,
    too_long_code: str,
    max_length: int,
) -> str:
    text = value.strip() if isinstance(value, str) else ""
    if not text:
        raise BoardValidationError(invalid_code, f"Invalid {label}")
    if len(text) > max_length:
        raise BoardValidationError(too_long_code, f"{label} is too long")
    return text


def _optional_text(
    value: Any, *, label: str, too_long_code: str, max_length: int
) -> str:
    text = value if isinstance(value, str) else ""
    if len(text) > max_length:
        raise BoardValidationError(too_long_code, f"{label} is too long")
    return text


def _get_project(session: Session, project_id: str) -> Project:
    project = session.get(Project, project_id)
    if project is None:
        raise BoardValidationError("invalid_project_id", "Invalid project")
    return project


def _get_task(session: Session, task_id: str) -> Task:
    task = session.get(Task, task_id)
    if task is None:
        raise BoardValidationError("invalid_task_id", "Invalid task")
    return task


def _require_status(status: str) -> TaskStatus:
    try:
        return TaskStatus(status)
    except ValueError as exc:
        raise BoardValidationError("invalid_status", "Invalid status") from exc


def _column_tasks(session: Session, project_id: str, status: TaskStatus) -> list[Task]:
    return list(
        session.scalars(
            select(Task)
            .where(Task.project_id == project_id, Task.status == status)
            .order_by(Task.position.asc(), Task.created_at.asc(), Task.id.asc())
        )
    )


def get_board_snapshot(session: Session) -> dict[str, list[dict[str, Any]]]:
    projects = list(
        session.scalars(
            select(Project).order_by(
                Project.position.asc(), Project.created_at.asc(), Project.id.asc()
            )
        )
    )
    tasks = list(
        session.scalars(
            select(Task).order_by(
                Task.project_id.asc(),
                Task.status.asc(),
                Task.position.asc(),
                Task.created_at.asc(),
                Task.id.asc(),
            )
        )
    )
    return {
        "projects": [_serialize_project(project) for project in projects],
        "tasks": [_serialize_task(task) for task in tasks],
    }


def create_project(session: Session, name: str) -> dict[str, Any]:
    def operation() -> dict[str, Any]:
        clean_name = _require_text(
            name,
            label="project name",
            invalid_code="invalid_project_name",
            too_long_code="project_name_too_long",
            max_length=PROJECT_NAME_MAX_LENGTH,
        )
        project = Project(
            id=str(uuid4()),
            name=clean_name,
            position=session.query(Project).count(),
            hidden=False,
        )
        session.add(project)
        session.flush()
        return _serialize_project(project)

    return _run_in_transaction(session, operation)


def rename_project(session: Session, project_id: str, name: str) -> dict[str, Any]:
    def operation() -> dict[str, Any]:
        project = _get_project(session, project_id)
        project.name = _require_text(
            name,
            label="project name",
            invalid_code="invalid_project_name",
            too_long_code="project_name_too_long",
            max_length=PROJECT_NAME_MAX_LENGTH,
        )
        session.flush()
        return _serialize_project(project)

    return _run_in_transaction(session, operation)


def delete_project(session: Session, project_id: str) -> None:
    try:
        project = _get_project(session, project_id)
        tasks = _column_tasks(session, project_id, TaskStatus.TODO) + _column_tasks(
            session, project_id, TaskStatus.DOING
        ) + _column_tasks(session, project_id, TaskStatus.DONE)
        trash_entry = {
            "project": deepcopy(_serialize_project(project)),
            "tasks": [deepcopy(_serialize_task(task)) for task in tasks],
            "deleted_at": _utc_now(),
        }
        session.delete(project)
        session.commit()
    except BoardValidationError:
        session.rollback()
        raise
    except Exception:
        session.rollback()
        raise

    _DELETED_PROJECT_TRASH[project_id] = trash_entry


def undo_delete_project(session: Session, project_id: str) -> None:
    try:
        entry = _DELETED_PROJECT_TRASH.get(project_id)
        if entry is None or _utc_now() - entry["deleted_at"] > timedelta(
            seconds=UNDO_DELETE_TTL_SECONDS
        ):
            _DELETED_PROJECT_TRASH.pop(project_id, None)
            raise BoardValidationError("nothing_to_undo", "Nothing to undo")

        project_data = entry["project"]
        session.add(
            Project(
                id=project_data["id"],
                name=project_data["name"],
                position=project_data["position"],
                hidden=project_data["hidden"],
                created_at=datetime.fromisoformat(
                    project_data["created_at"].replace("Z", "+00:00")
                ),
            )
        )
        for task_data in entry["tasks"]:
            session.add(
                Task(
                    id=task_data["id"],
                    project_id=task_data["project_id"],
                    title=task_data["title"],
                    assignee=task_data["assignee"],
                    notes=task_data["notes"],
                    status=TaskStatus(task_data["status"]),
                    position=task_data["position"],
                    created_at=datetime.fromisoformat(
                        task_data["created_at"].replace("Z", "+00:00")
                    ),
                )
            )
        session.commit()
    except BoardValidationError:
        session.rollback()
        raise
    except Exception:
        session.rollback()
        raise

    _DELETED_PROJECT_TRASH.pop(project_id, None)


def set_project_hidden(
    session: Session, project_id: str, hidden: bool
) -> dict[str, Any]:
    def operation() -> dict[str, Any]:
        project = _get_project(session, project_id)
        project.hidden = hidden
        session.flush()
        return _serialize_project(project)

    return _run_in_transaction(session, operation)


def reorder_projects(session: Session, ordered_ids: list[str]) -> None:
    def operation() -> None:
        projects = list(
            session.scalars(
                select(Project).order_by(
                    Project.position.asc(), Project.created_at.asc(), Project.id.asc()
                )
            )
        )
        current_ids = [project.id for project in projects]
        if len(ordered_ids) != len(current_ids) or set(ordered_ids) != set(current_ids):
            raise BoardValidationError("invalid_project_id", "Invalid project")

        projects_by_id = {project.id: project for project in projects}
        for index, project_id in enumerate(ordered_ids):
            projects_by_id[project_id].position = index
        session.flush()

    _run_in_transaction(session, operation)


def create_task(
    session: Session,
    project_id: str,
    title: str,
    assignee: str,
    notes: str | None = None,
) -> dict[str, Any]:
    def operation() -> dict[str, Any]:
        _get_project(session, project_id)
        task = Task(
            id=str(uuid4()),
            project_id=project_id,
            title=_require_text(
                title,
                label="task title",
                invalid_code="invalid_task_title",
                too_long_code="task_title_too_long",
                max_length=TASK_TITLE_MAX_LENGTH,
            ),
            assignee=_require_text(
                assignee,
                label="assignee",
                invalid_code="invalid_assignee",
                too_long_code="assignee_too_long",
                max_length=ASSIGNEE_MAX_LENGTH,
            ),
            notes=_optional_text(
                notes,
                label="notes",
                too_long_code="notes_too_long",
                max_length=NOTES_MAX_LENGTH,
            ),
            status=TaskStatus.TODO,
            position=len(_column_tasks(session, project_id, TaskStatus.TODO)),
        )
        session.add(task)
        session.flush()
        return _serialize_task(task)

    return _run_in_transaction(session, operation)


def update_task(
    session: Session, task_id: str, patch: Mapping[str, Any]
) -> dict[str, Any]:
    def operation() -> dict[str, Any]:
        task = _get_task(session, task_id)
        if "title" in patch:
            task.title = _require_text(
                patch["title"],
                label="task title",
                invalid_code="invalid_task_title",
                too_long_code="task_title_too_long",
                max_length=TASK_TITLE_MAX_LENGTH,
            )
        if "assignee" in patch:
            task.assignee = _require_text(
                patch["assignee"],
                label="assignee",
                invalid_code="invalid_assignee",
                too_long_code="assignee_too_long",
                max_length=ASSIGNEE_MAX_LENGTH,
            )
        if "notes" in patch:
            task.notes = _optional_text(
                patch["notes"],
                label="notes",
                too_long_code="notes_too_long",
                max_length=NOTES_MAX_LENGTH,
            )
        session.flush()
        return _serialize_task(task)

    return _run_in_transaction(session, operation)


def delete_task(session: Session, task_id: str) -> None:
    def operation() -> None:
        task = _get_task(session, task_id)
        session.delete(task)

    _run_in_transaction(session, operation)


def move_task(
    session: Session, task_id: str, project_id: str, status: str, index: int
) -> dict[str, Any]:
    def operation() -> dict[str, Any]:
        task = _get_task(session, task_id)
        _get_project(session, project_id)
        target_status = _require_status(status)

        target = [
            item
            for item in _column_tasks(session, project_id, target_status)
            if item.id != task_id
        ]
        source = [
            item
            for item in _column_tasks(session, task.project_id, task.status)
            if item.id != task_id
        ]
        for position, source_task in enumerate(source):
            source_task.position = position

        task.project_id = project_id
        task.status = target_status
        bounded_index = max(0, min(index, len(target)))
        target.insert(bounded_index, task)
        for position, target_task in enumerate(target):
            target_task.position = position

        session.flush()
        return _serialize_task(task)

    return _run_in_transaction(session, operation)
