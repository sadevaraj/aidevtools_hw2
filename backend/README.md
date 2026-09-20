# Backend foundation

Install dependencies from the repository root:

```bash
python -m pip install -r backend/requirements.txt
```

Run the FastAPI app from the repository root:

```bash
python -m uvicorn app.main:app --app-dir backend
```

The backend reads `SDIP_DATABASE_URL` (or `DATABASE_URL`) and requires one of
these variables to be set. For local PostgreSQL development:

```bash
export SDIP_DATABASE_URL=postgresql+psycopg://sdip:sdip@localhost:5432/sdip
make run
```

The Docker Compose PostgreSQL service stores its data in the project-local
`database/` directory.

For Render, set `DATABASE_URL` to the Render Postgres **Internal Database URL**
and start the service with:

```bash
uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
```

Render's `PORT` is supplied automatically. The `/health` endpoint can be used
as the Web Service health check, and the WebSocket endpoint is available at
`/ws`.
