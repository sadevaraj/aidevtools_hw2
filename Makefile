.PHONY: run compose-up test integration

run:
	@test -n "$(SDIP_DATABASE_URL)" || (echo "SDIP_DATABASE_URL must be set" >&2; exit 1)
	@docker compose up -d db
	@cd backend && SDIP_DATABASE_URL="$(SDIP_DATABASE_URL)" python -m uvicorn app.main:app --host 0.0.0.0 --port "$${PORT:-8000}"

compose-up:
	docker compose up --build

test:
	cd backend && python -m pytest tests

integration:
	PYTHONPATH=backend python -m pytest integration_tests
