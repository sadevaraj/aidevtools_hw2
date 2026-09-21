# Simple Board

Create a mini kanban application. 

# Product Specification
## Project Board v1.0

### Vision

A lightweight, real-time project board for small engineering teams.

The goal is to provide a simple shared workspace where team members can create projects, assign tasks, and move work through a basic workflow without the complexity of Jira, Azure Boards, or similar enterprise tools.

---

# Guiding Principles

- Keep the product extremely simple.
- Prioritise usability over features.
- Avoid process-heavy workflows.
- Real-time collaboration by default.
- Desktop-first experience.
- Single-page application.
- No authentication in v1.
- No feature creep.

---

# Development Approach

The application will be built incrementally.

At the end of each phase, there must be a working application.

## Phase 1
### Clear Specification

Deliverables:

- Complete product specification
- UI wireframes
- Database schema draft
- Architecture decisions
- Development roadmap

Result:

- Clear understanding of the product

---

## Phase 2
### Frontend Prototype + Mock Backend

Deliverables:

- React UI
- Local mock data
- Drag and drop working
- Project management UI
- Task management UI
- Dark theme

Result:

- Fully usable UI
- No server dependency

---

## Phase 3
### Backend Integration

Deliverables:

- FastAPI backend
- WebSocket API
- Real-time updates
- Mock in-memory storage

Result:

- Multiple users can collaborate

---

## Phase 4
### PostgreSQL Persistence

Deliverables:

- PostgreSQL database
- Persistent projects
- Persistent tasks
- Startup database initialization

Result:

- Production-ready MVP

---

# Target Users

Small teams

Team size:

- 2 to 10 members

Example users:

- Developers
- DevOps engineers
- Test engineers
- Small project teams

---

# Technology Stack

## Frontend

- React
- JavaScript
- CSS Modules
- @dnd-kit
- Native WebSocket API

## Backend

- FastAPI
- Python
- SQLAlchemy
- SQLite
- WebSockets

## Deployment

- Docker Compose
- Local development support

---

# Application Type

Single Page Application (SPA)

All functionality exists on one page.

No routing.

No additional pages.

---

# Theme

## Theme Mode

Dark theme only.

Inspired by:

- GitHub Projects
- GitHub Issues
- GitHub Dark Theme

## Colour Palette

Background

```css
#0D1117
```

Cards

```css
#161B22
```

Borders

```css
#30363D
```

Primary Text

```css
#E6EDF3
```

Secondary Text

```css
#7D8590
```

Connected Status

```css
#3FB950
```

Reconnecting Status

```css
#D29922
```

Disconnected Status

```css
#F85149
```

---

# Layout

## Header

Contains:

- Project Board title
- New Project button
- New Task button
- Connection status
- Current display name

Board title is fixed:

```text
Project Board
```

---

# User Identity

No authentication.

No passwords.

No accounts.

## First Visit

User enters:

```text
Display Name
```

Example:

```text
Devaraj
```

Stored:

- Browser local storage
- Server user suggestion list

## Future Visits

Display name automatically restored.

User can change it at any time.

---

# Board Structure

Single board.

Projects displayed vertically.

Example:

```text
Project Alpha

To Do | Doing | Done

Project Beta

To Do | Doing | Done
```

---

# Projects

## Project Fields

### Required

- Name

### Limits

Project Name

- Maximum 50 characters

---

## Project Features

Create project

Delete project

Reorder projects

Hide empty projects

Show hidden projects

---

## Project Ordering

Manual drag and drop ordering.

---

## Empty Projects

When a project becomes empty:

User may choose:

- Keep Visible
- Hide Project

---

## Project Deletion

Deleting a project:

- Deletes all tasks inside the project

Undo available for a few seconds.

---

# Task Structure

## Fields

### Required

Title

Maximum:

- 100 characters

Assignee

Maximum:

- 50 characters

### Optional

Notes

Maximum:

- 2000 characters

Plain text only.

No Markdown.

---

# Task Card Layout

Collapsed

```text
Implement Jenkins Cleanup

Devaraj
```

Expanded

```text
Title
Implement Jenkins Cleanup

Assignee
Devaraj

Notes
...
```

---

# Task Creation

Global "New Task" button.

Required:

- Title
- Assignee
- Project

Default status:

```text
To Do
```

---

# Task Editing

Supported:

- Title
- Assignee
- Notes

Editing is inline.

No modal.

No separate page.

---

# Task Expansion

Single click opens task details.

Task expands in place.

Clicking outside closes task.

Changes are saved automatically when closing.

---

# Task Workflow

Columns:

```text
To Do
Doing
Done
```

No custom workflows.

No additional statuses.

---

# Task Movement

Supported:

- Move between columns
- Move between projects
- Reorder within column

Drag and drop everywhere.

---

# Status Rules

Moving a task to another project:

Automatically changes project assignment.

Completed tasks remain visible forever.

---

# Collaboration

Real-time updates for all users.

WebSockets only.

---

# Editing Indicator

When a task is expanded:

Show:

```text
Editing by <Name>
```

Example:

```text
Editing by Devaraj
```

This is informational only.

No locking.

---

# Conflict Resolution

Approach:

Last write wins.

No task locking.

No edit reservations.

---

# Connection Handling

## Connected

Normal operation.

## Reconnecting

Visible status indicator shown.

## Disconnected

Editing disabled.

Dragging disabled.

Creation disabled.

Deletion disabled.

System automatically reconnects.

---

# Reconnect Behaviour

After reconnect:

- Download full board state
- Replace current client state
- Re-enable editing

---

# WebSocket Model

All communication goes through WebSockets.

No REST API.

Operations:

- Create project
- Edit project
- Delete project
- Reorder project
- Create task
- Edit task
- Delete task
- Move task
- Reorder task

---

# Server Authority

The server is the source of truth.

Client state updates only after server confirmation.

---

# Validation

Server validates all requests.

Checks include:

- Required fields
- Length limits
- Valid project IDs
- Valid task IDs
- Valid status values

---

# Validation Failure

Display short error.

Example:

```text
Invalid task title
```

Keep board state unchanged.

---

# Save Behaviour

After a user action:

- Show spinner
- Disable further actions on affected item
- Wait for server response

On success:

- Remove spinner
- Apply update

---

# Timeout Behaviour

1. Send request
2. Wait for response
3. Timeout
4. Retry once

If retry fails:

```text
Could not save changes
```

Board returns to last confirmed state.

---

# Database Schema

## Projects

```sql
projects
--------
id
name
position
hidden
created_at
```

## Tasks

```sql
tasks
-----
id
project_id
title
assignee
notes
status
position
created_at
```

---

# Empty Board State

Shown when no projects exist:

```text
No projects yet.

[ Create your first project ]
```

---

# Explicitly Out Of Scope

Authentication

Permissions

Roles

Groups

Teams integration

Email integration

Notifications

Tags

Labels

Colours

Priorities

Due dates

Comments

Attachments

Subtasks

Search

Filtering

Metrics

Reporting

Dashboards

Audit history

Activity feed

Mobile layout

Multiple boards

Custom workflows

User avatars

Markdown notes

Code blocks

---

# MVP Success Criteria

A user can:

1. Open the application.
2. Enter a display name.
3. Create a project.
4. Create a task.
5. Assign a task.
6. Add notes.
7. Move tasks between statuses.
8. Move tasks between projects.
9. Reorder tasks.
10. Collaborate with other users in real time.
11. Close the browser.
12. Return later and see all data preserved.

When all criteria are met, MVP v1.0 is complete.

Centralize every backend call in one services layer, and create a mock
implementation of it so the whole app runs without a real backend.

Add tests.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://httpsgithubcomsadevarajaidevtoolshw2.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7b1bba14-641c-4d67-b244-bcb2be29ceb5).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Project Structure

```text
/backend     # backend application and its tests
/docs        # supporting documentation
/frontend    # frontend application
AGENTS.md    # instructions for coding agents
openapi.yaml # API agreement
```

## Development

### Running with Docker

Start both the frontend and backend together with Docker Compose:

```sh
docker compose up --build
```

This publishes the frontend at `http://localhost:5173` and the backend at
`http://localhost:8000`. The compose file sets
`VITE_BOARD_WS_URL=ws://localhost:8000/ws` so the browser can reach the backend
WebSocket through the Docker-published host port. If you override that variable,
keep it host-reachable (for example `ws://localhost:8000/ws`), not a
Docker-internal hostname such as `ws://backend:8000/ws`.

Stop the stack with:

```sh
docker compose down
```

To start only the backend or only the frontend container:

```sh
docker compose up --build -d backend
docker compose up --build -d frontend
```

(The frontend depends on the backend to reach the WebSocket, so start the
backend first if running the frontend alone.)

PostgreSQL data is persisted in the project-local `database/data/` directory,
which is mounted into the PostgreSQL container. It survives a normal
`docker compose down` followed by `docker compose up`.

To intentionally clear the persisted database data, remove the directory:

```sh
docker compose down
rm -rf database/*
```

For host-based backend development, start PostgreSQL and run the backend with:

```sh
export SDIP_DATABASE_URL=postgresql+psycopg://sdip:sdip@localhost:5432/sdip
make run
```

The `export` command sets a shell environment variable; it does not read an
`.env` file. `make run` starts only the PostgreSQL Compose service and runs
FastAPI on the host, so `localhost` is correct. Use `make compose-up` to run
the complete frontend, backend, and database stack in Docker.

The frontend selects its board service using the client-exposed Vite
environment variable `VITE_BOARD_WS_URL`.

- Vite requires the `VITE_` prefix for frontend environment variables.
- Set `VITE_BOARD_WS_URL` to a full browser-reachable WebSocket URL, for
  example `ws://localhost:8000/ws`, to use the real WebSocket-backed service.
- Leave `VITE_BOARD_WS_URL` unset or blank to keep using the built-in mock
  board service for frontend-only development.
- Vite inlines `VITE_*` variables into the bundle **when the bundle is
  built**, so this must be set at build time. Setting it only as a runtime
  environment variable has no effect. When the frontend is containerised it
  is passed as a Docker build argument, which is what `docker-compose.yml`
  does.
- The value must be a complete, valid WebSocket URL. A wrong-but-present URL
  still selects the real board service, so the app connects to nothing and
  sits in a reconnecting state instead of falling back to the mock. Note that
  hostnames use hyphens, not underscores.

### Deploying to Render

Deploy the application as three Render resources:

1. **Render Postgres** for persistent application data.
2. **Backend Web Service** for FastAPI and the WebSocket endpoint.
3. **Frontend Web Service** for the TanStack Start server build.

#### 1. Create the Render Postgres database

Create a PostgreSQL database in the same Render region as the backend. In the
backend Web Service, add the database's **Internal Database URL** as:

```text
DATABASE_URL=<Render internal database URL>
```

The backend also accepts `SDIP_DATABASE_URL`, but `DATABASE_URL` is the
standard Render connection-variable name. Do not use `localhost` for this
connection, and do not commit the URL or its password to the repository.

#### 2. Create the backend Web Service

Create a Web Service from this repository with:

```text
Root Directory: backend
Runtime: Python
Build Command: pip install -r requirements.txt
Start Command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
Health Check Path: /health
```

Render supplies `PORT` automatically. Add the Postgres **Internal Database
URL** as `DATABASE_URL`. Render Web Services support WebSockets, so the
backend's `/ws` endpoint can be used by the frontend.

#### 3. Create the frontend Web Service

The frontend is a TanStack Start application. Its build produces a Nitro
server bundle in `.output/`, not a directory of purely static files, so it is
deployed as a Web Service rather than as a Static Site. Create a Web Service
from this repository using the Node runtime with:

```text
Root Directory: frontend
Build Command: npm install && npm run build
Start Command: node .output/server/index.mjs
```

There is no `dist` directory to publish, and `.output/public` alone would
drop server-side rendering.

Set both of these environment variables on the service:

```text
VITE_BOARD_WS_URL=wss://<backend-service-name>.onrender.com/ws
NITRO_PRESET=render-com
```

`VITE_BOARD_WS_URL` points the frontend at the backend. Use `wss://` for the
public HTTPS deployment; the local `ws://localhost:8000/ws` value is only for
local development and must not be used in the deployed frontend.

`NITRO_PRESET` selects the build target. Nitro defaults to a Cloudflare
target, which does not produce the plain Node server that the start command
above runs, so this must be set explicitly on the Node runtime. A correct
build reports `"preset": "render-com"` and `"serverEntry": "server/index.mjs"`
in `.output/nitro.json`.

Both variables are read while the build command runs, so on this runtime
setting them in the service's environment is enough. `VITE_BOARD_WS_URL` in
particular is inlined into the client bundle by Vite at build time: a bundle
built without it silently falls back to the in-browser mock board service,
never contacts the backend, and gives every browser its own private board.
Because the value is baked in, redeploy after changing it, and use **Clear
build cache & deploy** so a cached bundle is not reused.

To confirm a deployed frontend really talks to the backend, open it and check
that the browser establishes a WebSocket to `/ws` on the backend host and
that the backend logs the connection. Backend logs showing only `/health`
requests mean nothing is connecting. Check the hostname carefully: it uses
hyphens rather than underscores, and an unresolvable host leaves the board
retrying its connection instead of reporting a clear error.

Deploying the frontend with Docker instead is supported by
`frontend/Dockerfile`, which performs the same build and sets `NITRO_PRESET`
itself. On the Docker runtime the build has no access to service environment
variables, so the Dockerfile declares `ARG VITE_BOARD_WS_URL` to receive the
value as a build argument. This is also how `docker-compose.yml` passes it
locally.

The local `database/data/` directory and Docker bind mount are only for local
Compose development. Render persistence comes from the managed Render
Postgres database instead.

### Continuous Integration and Deployment

`.github/workflows/ci-cd.yml` runs on every push and pull request against
`main`:

1. **Frontend tests** (Bun + vitest) and **backend tests** (pytest) run in
   parallel.
2. **Backend integration tests** run next, against a `postgres:16-alpine`
   service container, and only if both test jobs passed.
3. **Deploy to Render** runs last, only for pushes to `main` and only if the
   integration tests passed. It redeploys both the backend and the frontend.

Render does not support GitHub OIDC or workload identity federation, so the
deploy step cannot exchange an OIDC token for Render credentials. Instead it
uses a service-scoped **Deploy Hook**, which avoids creating a user or an
account-wide API key: the hook belongs to the service, can only trigger a
deploy, and can be regenerated to revoke it.

To enable deployment, copy each service's deploy hook from **Settings →
Deploy Hook** in the Render dashboard and add them to GitHub as repository
secrets (under **Settings → Secrets and variables → Actions**):

| Secret | Render service |
| ------ | -------------- |
| `RENDER_DEPLOY_HOOK_URL` | backend Web Service |
| `RENDER_FRONTEND_DEPLOY_HOOK_URL` | frontend service |

A deploy hook URL is a credential, so treat it like a password and never
commit it. Turn off Render's own auto-deploy so the pipeline is the only
thing that ships, otherwise Render deploys on push before the tests have
run.

The deploy job targets a `production` environment, so GitHub environment
protection rules such as required reviewers can gate it if desired.

### Running Tests in Docker

Backend tests (pytest), run in a throwaway container so nothing needs to be
installed on the host:

```sh
docker run --rm -v "$(pwd)/backend":/app -w /app python:3.12-slim \
  sh -c "pip install -r requirements.txt && PYTHONPATH=. pytest tests -q"
```

Frontend tests (vitest via Bun), also in a throwaway container:

```sh
docker run --rm -v "$(pwd)/frontend":/app -w /app oven/bun:1 \
  sh -c "bun install && bun run test"
```

Each command only runs its own suite — there is no single combined test
runner across both stacks.

### Running Locally (Without Docker)

You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
cd frontend
npm i
npm run dev
```

To connect the local frontend to the real backend, start it with:

```sh
VITE_BOARD_WS_URL=ws://localhost:8000/ws npm run dev
```

To run the backend locally instead of (or alongside) Docker, you need Python 3.12+:

```sh
python -m pip install -r backend/requirements.txt
python -m uvicorn app.main:app --app-dir backend
```

This starts the backend on `http://localhost:8000`. Set
`SDIP_DATABASE_URL` (or `DATABASE_URL`) to a PostgreSQL connection URL before
starting it.

To run tests locally without Docker:

```sh
# Backend
python -m pip install -r backend/requirements.txt
PYTHONPATH=backend pytest backend/tests -q

# PostgreSQL integration test (requires a reachable PostgreSQL database)
SDIP_DATABASE_URL=postgresql+psycopg://sdip:sdip@localhost:5432/sdip \
  PYTHONPATH=backend pytest integration_tests -q

# Frontend
cd frontend && npm install && npm run test
```
