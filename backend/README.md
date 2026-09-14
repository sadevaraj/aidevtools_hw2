# Backend foundation

Install dependencies from the repository root:

```bash
python -m pip install -r backend/requirements.txt
```

Run the FastAPI app from the repository root:

```bash
python -m uvicorn app.main:app --app-dir backend
```

The backend reads `DATABASE_URL` when set. If it is unset, it uses
`backend/data/board.db`.
