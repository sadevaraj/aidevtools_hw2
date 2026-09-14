from __future__ import annotations

import json
from collections import OrderedDict
from collections.abc import Generator
from dataclasses import dataclass, field
from typing import Any

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from . import board_service
from .board_service import BoardValidationError
from .models import Project, Task

router = APIRouter()

REQUEST_CACHE_SIZE = 50


@dataclass
class ConnectionState:
    request_cache: OrderedDict[str, dict[str, Any]] = field(default_factory=OrderedDict)
    editing_tasks: set[str] = field(default_factory=set)


class ConnectionManager:
    def __init__(self, cache_size: int = REQUEST_CACHE_SIZE):
        self.cache_size = cache_size
        self.active_connections: set[WebSocket] = set()
        self._states: dict[WebSocket, ConnectionState] = {}
        self._task_owners: dict[str, WebSocket] = {}
        self._editing: dict[str, str] = {}

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.add(websocket)
        self._states[websocket] = ConnectionState()

    def disconnect(self, websocket: WebSocket) -> bool:
        self.active_connections.discard(websocket)
        return self._remove_connection_state(websocket)

    def _remove_connection_state(self, websocket: WebSocket) -> bool:
        state = self._states.pop(websocket, None)
        if state is None:
            return False

        changed = False
        for task_id in list(state.editing_tasks):
            owner = self._task_owners.get(task_id)
            if owner is websocket:
                self._task_owners.pop(task_id, None)
                self._editing.pop(task_id, None)
                changed = True
        return changed

    def get_cached_result(
        self, websocket: WebSocket, request_id: str
    ) -> dict[str, Any] | None:
        state = self._states.get(websocket)
        if state is None:
            return None

        result = state.request_cache.get(request_id)
        if result is not None:
            state.request_cache.move_to_end(request_id)
        return result

    def cache_result(self, websocket: WebSocket, request_id: str, message: dict[str, Any]) -> None:
        state = self._states.get(websocket)
        if state is None:
            return

        state.request_cache[request_id] = message
        state.request_cache.move_to_end(request_id)
        while len(state.request_cache) > self.cache_size:
            state.request_cache.popitem(last=False)

    def set_editing(self, websocket: WebSocket, task_id: str | None, display_name: str) -> bool:
        state = self._states.get(websocket)
        if state is None:
            return False

        if task_id is None:
            return self._clear_editing(websocket, state)

        previous_owner = self._task_owners.get(task_id)
        if previous_owner is websocket and self._editing.get(task_id) == display_name:
            return False

        if previous_owner is not None and previous_owner is not websocket:
            previous_state = self._states.get(previous_owner)
            if previous_state is not None:
                previous_state.editing_tasks.discard(task_id)

        self._task_owners[task_id] = websocket
        self._editing[task_id] = display_name
        state.editing_tasks.add(task_id)
        return True

    def _clear_editing(self, websocket: WebSocket, state: ConnectionState) -> bool:
        changed = False
        for task_id in list(state.editing_tasks):
            owner = self._task_owners.get(task_id)
            if owner is websocket:
                self._task_owners.pop(task_id, None)
                self._editing.pop(task_id, None)
                changed = True
        state.editing_tasks.clear()
        return changed

    def presence_message(self) -> dict[str, Any]:
        return {"type": "presence", "payload": {"editing": dict(self._editing)}}

    async def broadcast(self, message: dict[str, Any]) -> None:
        disconnected: list[WebSocket] = []
        for websocket in list(self.active_connections):
            try:
                await websocket.send_json(message)
            except (RuntimeError, WebSocketDisconnect):
                disconnected.append(websocket)

        presence_changed = False
        for websocket in disconnected:
            presence_changed = self.disconnect(websocket) or presence_changed

        if presence_changed and self.active_connections:
            await self.broadcast(self.presence_message())

    def reset(self) -> None:
        self.active_connections.clear()
        self._states.clear()
        self._task_owners.clear()
        self._editing.clear()


manager = ConnectionManager()


def _find_project_snapshot(session: Session, project_id: str) -> dict[str, Any]:
    project = session.get(Project, project_id)
    if project is None:
        raise BoardValidationError("invalid_project_id", "Invalid project")
    for item in board_service.get_board_snapshot(session)["projects"]:
        if item["id"] == project_id:
            return item
    raise BoardValidationError("invalid_project_id", "Invalid project")


def _find_task_snapshot(session: Session, task_id: str) -> dict[str, Any]:
    task = session.get(Task, task_id)
    if task is None:
        raise BoardValidationError("invalid_task_id", "Invalid task")
    for item in board_service.get_board_snapshot(session)["tasks"]:
        if item["id"] == task_id:
            return item
    raise BoardValidationError("invalid_task_id", "Invalid task")


def _current_ordered_project_ids(session: Session) -> list[str]:
    return [project["id"] for project in board_service.get_board_snapshot(session)["projects"]]


def _command_ok(request_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    return {"type": "command_ok", "requestId": request_id, "payload": payload}


def _command_error(request_id: str, error: BoardValidationError) -> dict[str, Any]:
    return {
        "type": "command_error",
        "requestId": request_id,
        "payload": {"code": error.code, "message": error.message},
    }


def _is_valid_set_editing_payload(payload: Any) -> bool:
    return (
        isinstance(payload, dict)
        and "taskId" in payload
        and ("displayName" in payload)
        and (payload["taskId"] is None or isinstance(payload["taskId"], str))
        and isinstance(payload["displayName"], str)
        and 1 <= len(payload["displayName"]) <= 50
    )


def _handle_command(
    session: Session, command_type: str, payload: dict[str, Any], request_id: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    if command_type == "create_project":
        project = board_service.create_project(session, payload["name"])
        return _command_ok(request_id, {"project": project}), {
            "type": "board_event",
            "payload": {"eventType": "project_created", "project": project},
        }
    if command_type == "rename_project":
        project = board_service.rename_project(session, payload["id"], payload["name"])
        return _command_ok(request_id, {"project": project}), {
            "type": "board_event",
            "payload": {"eventType": "project_renamed", "project": project},
        }
    if command_type == "delete_project":
        project = _find_project_snapshot(session, payload["id"])
        board_service.delete_project(session, payload["id"])
        return _command_ok(request_id, {}), {
            "type": "board_event",
            "payload": {"eventType": "project_deleted", "project": project},
        }
    if command_type == "undo_delete_project":
        board_service.undo_delete_project(session, payload["id"])
        project = _find_project_snapshot(session, payload["id"])
        return _command_ok(request_id, {}), {
            "type": "board_event",
            "payload": {"eventType": "project_restored", "project": project},
        }
    if command_type == "set_project_hidden":
        project = board_service.set_project_hidden(session, payload["id"], payload["hidden"])
        return _command_ok(request_id, {"project": project}), {
            "type": "board_event",
            "payload": {"eventType": "project_hidden_set", "project": project},
        }
    if command_type == "reorder_projects":
        board_service.reorder_projects(session, payload["orderedIds"])
        ordered_ids = _current_ordered_project_ids(session)
        return _command_ok(request_id, {}), {
            "type": "board_event",
            "payload": {"eventType": "projects_reordered", "orderedIds": ordered_ids},
        }
    if command_type == "create_task":
        task = board_service.create_task(
            session,
            payload["project_id"],
            payload["title"],
            payload["assignee"],
            payload.get("notes"),
        )
        return _command_ok(request_id, {"task": task}), {
            "type": "board_event",
            "payload": {"eventType": "task_created", "task": task},
        }
    if command_type == "update_task":
        task = board_service.update_task(session, payload["id"], payload["patch"])
        return _command_ok(request_id, {"task": task}), {
            "type": "board_event",
            "payload": {"eventType": "task_updated", "task": task},
        }
    if command_type == "delete_task":
        task = _find_task_snapshot(session, payload["id"])
        board_service.delete_task(session, payload["id"])
        return _command_ok(request_id, {}), {
            "type": "board_event",
            "payload": {"eventType": "task_deleted", "task": task},
        }
    if command_type == "move_task":
        task = board_service.move_task(
            session,
            payload["taskId"],
            payload["project_id"],
            payload["status"],
            payload["index"],
        )
        return _command_ok(request_id, {"task": task}), {
            "type": "board_event",
            "payload": {"eventType": "task_moved", "task": task},
        }
    raise ValueError(f"Unsupported command type: {command_type}")


def get_websocket_session(websocket: WebSocket) -> Generator[Session, None, None]:
    session = websocket.app.state.session_factory()
    try:
        yield session
    finally:
        session.close()


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket, session: Session = Depends(get_websocket_session)
) -> None:
    await manager.connect(websocket)
    try:
        await websocket.send_json(
            {
                "type": "snapshot",
                "payload": {"board": board_service.get_board_snapshot(session)},
            }
        )

        while True:
            raw_message = await websocket.receive_text()
            try:
                message = json.loads(raw_message)
            except json.JSONDecodeError:
                continue

            if not isinstance(message, dict):
                continue

            command_type = message.get("type")
            request_id = message.get("requestId")
            payload = message.get("payload")

            if not isinstance(command_type, str) or not isinstance(payload, dict):
                continue

            if command_type == "set_editing":
                if not isinstance(request_id, str) or not _is_valid_set_editing_payload(payload):
                    continue
                if manager.set_editing(
                    websocket, payload["taskId"], payload["displayName"]
                ):
                    await manager.broadcast(manager.presence_message())
                continue

            if not isinstance(request_id, str):
                continue

            cached_result = manager.get_cached_result(websocket, request_id)
            if cached_result is not None:
                await websocket.send_json(cached_result)
                continue

            try:
                response, board_event = _handle_command(
                    session, command_type, payload, request_id
                )
            except BoardValidationError as error:
                response = _command_error(request_id, error)
                manager.cache_result(websocket, request_id, response)
                await websocket.send_json(response)
                continue
            except ValueError:
                continue

            manager.cache_result(websocket, request_id, response)
            await websocket.send_json(response)
            await manager.broadcast(board_event)
    except WebSocketDisconnect:
        if manager.disconnect(websocket) and manager.active_connections:
            await manager.broadcast(manager.presence_message())
