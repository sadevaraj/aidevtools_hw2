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
### SQLite Persistence

Deliverables:

- SQLite database
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