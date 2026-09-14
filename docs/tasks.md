# Project Board implementation backlog

Tasks are ordered by dependency. Complete one GitHub issue at a time following
`docs/process.md`.

## 1. Define the WebSocket protocol contract

## Goal

Replace the REST-oriented API outline with one implementation-ready contract
for the Project Board's native WebSocket API.

## Acceptance criteria

- [ ] `openapi.yaml` no longer documents REST project or task endpoints.
- [ ] The contract defines `/ws` and JSON envelope fields: `type`,
  `requestId` where applicable, and `payload`.
- [ ] Commands cover every `BoardService` operation: project
  create/rename/delete/undo/hide/reorder; task create/update/delete/move; and
  editing presence.
- [ ] Server `snapshot`, acknowledgement, board event, presence, and error
  messages are documented with payloads.
- [ ] Validation errors, request correlation, one client retry after timeout,
  reconnect snapshot replacement, and last-write-wins behavior are defined.
- [ ] Field names match `frontend/src/lib/board/types.ts`, including
  `project_id`, `notes`, `position`, and `created_at`.

## Out of scope

- Backend WebSocket implementation, moved to #4.
- Frontend WebSocket client implementation, moved to #5.
- Database schema implementation, moved to #2.

## Constraints

- Modify only `openapi.yaml` and directly related protocol documentation.
- The WebSocket-only requirement in `docs/plan.md` is authoritative; do not
  add REST endpoints.
- Keep the contract compatible with the existing `BoardService` interface.

## 2. Establish the FastAPI and SQLite foundation

## Goal

Create a runnable FastAPI backend foundation with SQLAlchemy-backed SQLite
persistence and startup schema initialization.

## Acceptance criteria

- [ ] The backend has a documented Python dependency manifest and runnable
  FastAPI entry point.
- [ ] Configuration supports a SQLite URL and defaults to a writable local
  development database location.
- [ ] Startup creates `projects` and `tasks` tables when absent.
- [ ] Projects persist id, name, position, hidden, and created_at; tasks
  persist id, project_id, title, assignee, notes, status, position, and
  created_at.
- [ ] A task cannot reference a non-existent project, and deleting a project
  deletes its tasks.
- [ ] Focused tests prove initialization and persistence through a separate
  database session or application restart.

## Out of scope

- Domain mutations and validation rules, moved to #3.
- WebSocket endpoint and broadcasts, moved to #4.
- Containerization, moved to #7.

## Constraints

- Keep backend implementation in `backend/`.
- Use FastAPI, SQLAlchemy, SQLite, and Python.
- Do not expose REST board endpoints or modify completed frontend components.

## 3. Implement authoritative board mutations

## Goal

Implement the server-side project and task mutations with product validation,
transactional persistence, and stable ordering.

## Acceptance criteria

- [ ] A service layer returns a complete position-sorted board snapshot.
- [ ] Project create, rename, delete, restore-for-undo, hide/show, and reorder
  operations persist expected state.
- [ ] Task create, update, delete, and move operations persist expected state.
- [ ] Project names, task titles, assignees, and notes enforce the required
  values and maximum lengths in `frontend/src/lib/board/types.ts`.
- [ ] Task moves validate project IDs/statuses, update project and status, and
  keep every affected column's positions contiguous.
- [ ] Invalid IDs, statuses, or content return explicit validation errors with
  no partial board mutation.
- [ ] Tests cover project deletion with tasks, cross-project moves,
  same-column reorder, and invalid input.

## Out of scope

- Wire-format parsing and WebSocket responses, moved to #4.
- Ephemeral presence tracking, moved to #4.
- Client retries and reconnection, moved to #5.

## Constraints

- Build on #2 and remain compatible with the protocol in #1.
- Use one transaction per mutation and do not add REST routes.

## 4. Serve the board through native WebSockets

## Goal

Expose the authoritative board on `/ws` using the contract from #1 and
broadcast confirmed collaboration updates.

## Acceptance criteria

- [ ] A client connecting to `/ws` receives a complete board snapshot.
- [ ] Every documented command is parsed, validated, dispatched, and receives
  a correlated acknowledgement or error.
- [ ] Successful persistent mutations broadcast the confirmed update to all
  connected clients.
- [ ] Failed commands send a correlated error only to the requester and do not
  broadcast state changes.
- [ ] Editing presence broadcasts on start/end, is removed at disconnect, and
  is never persisted to SQLite.
- [ ] The six-second delete-project undo state is process-local and expires.
- [ ] WebSocket tests cover snapshot, success, validation failure, broadcast,
  presence cleanup, and undo expiry.

## Out of scope

- Database models/mutation semantics, moved to #2 and #3.
- Browser WebSocket lifecycle, moved to #5.
- Docker networking, moved to #7.

## Constraints

- Build on #1 and #3.
- Use FastAPI native WebSockets only: no Socket.IO or REST API.
- Operations are confirmed only after the server result.

## 5. Add the frontend WebSocket board service

## Goal

Implement a browser-native WebSocket `BoardService` that preserves the
completed UI while making the server the source of truth.

## Acceptance criteria

- [ ] `WebSocketBoardService` implements every method in
  `frontend/src/lib/board/types.ts` without changing `BoardService`.
- [ ] It connects using a configurable URL, receives the initial snapshot, and
  emits existing state, status, and presence subscription events.
- [ ] Mutations send #1 commands, resolve only after the matched
  acknowledgement, and reject with a server error message when rejected.
- [ ] It accurately emits connected, reconnecting, and disconnected status.
- [ ] Timed-out commands retry once; a second failure surfaces
  `Could not save changes` without applying an unconfirmed change.
- [ ] Reconnection replaces local state from a full server snapshot.
- [ ] Vitest coverage includes command mapping, acknowledgement/error
  correlation, retry, reconnect, and presence.

## Out of scope

- Changes to visual board components.
- Server protocol behavior, moved to #4.
- Environment-based service selection, moved to #6.

## Constraints

- Keep the integration behind `frontend/src/lib/board/service.ts` and
  `frontend/src/lib/board/types.ts`.
- Use native browser `WebSocket`, never Socket.IO or optimistic mutations.

## 6. Select the remote service by environment

## Goal

Use the remote board service in integrated development while keeping the mock
service available for isolated frontend testing and prototype work.

## Acceptance criteria

- [ ] `getBoardService()` selects `WebSocketBoardService` when a configured
  public WebSocket URL is available.
- [ ] The mock remains selectable without a backend for tests/prototypes.
- [ ] The public environment variable and its local-development value are
  documented.
- [ ] Board components do not import a concrete mock or WebSocket service.
- [ ] Existing mock and board tests run without a network connection.

## Out of scope

- WebSocket service implementation, moved to #5.
- Backend configuration, moved to #2 and #4.
- Docker Compose environment wiring, moved to #7.

## Constraints

- Modify only frontend service composition/configuration and directly related
  tests or documentation.
- Follow Vite's `VITE_*` public environment convention.
- Retain `__setBoardService` test injection.

## 7. Containerize the integrated application

## Goal

Run the frontend and backend with Docker Compose, browser-reachable WebSocket
connectivity, and durable SQLite storage.

## Acceptance criteria

- [ ] Docker Compose defines frontend and backend services.
- [ ] The frontend context remains `frontend/`; the backend Dockerfile/context
  are inside `backend/`.
- [ ] The browser's WebSocket URL works from the host, not only Docker's
  internal network.
- [ ] SQLite data uses a named volume or mounted directory that survives
  service recreation.
- [ ] `docker compose up --build` starts both services and connects the
  frontend to `/ws`.
- [ ] README instructions cover start, stop, and clearing persisted board data.

## Out of scope

- Cloud hosting, reverse proxies, TLS, multi-instance scaling, PostgreSQL, and
  external pub/sub infrastructure.
- Application feature implementation, moved to #2 through #6.

## Constraints

- Use Docker Compose and preserve the frontend project in `frontend/`.
- Keep SQLite to one backend process for the 2–10-user MVP.

## 8. Verify the end-to-end MVP behavior

## Goal

Provide focused automated and documented manual verification that the
integrated board meets the MVP collaboration, persistence, and reconnect
requirements.

## Acceptance criteria

- [ ] Backend tests use a temporary SQLite database for persistence/protocol
  coverage.
- [ ] Frontend tests cover the WebSocket adapter without a real network.
- [ ] Existing drag-and-drop and board tests pass unchanged.
- [ ] Documented two-browser verification confirms creation, movement,
  reordering, editing presence, and remote updates.
- [ ] Documented restart verification confirms projects/tasks survive backend
  or container recreation.
- [ ] Documented disconnect/reconnect verification confirms editing disables
  offline and a new snapshot replaces state on reconnect.

## Out of scope

- Product functionality beyond v1, authentication, multiple boards, mobile
  layout, performance/load testing, and all other explicitly excluded features.

## Constraints

- Build on #1 through #7.
- Use the existing frontend Vitest runner and backend test runner; add no
  unrelated test framework.
- Document reproducible commands and observed outcomes only.
