# Wei Journal - development and deployment helpers.
#
# Run `make help` for the list of targets.

BACKEND_DIR := backend
FRONTEND_DIR := frontend
DATA_DIR ?= $(CURDIR)/data
BACKUP_DIR ?= $(CURDIR)/backups
BACKUP_FILE ?= $(BACKUP_DIR)/journal-$(shell date +%Y%m%d-%H%M%S).db

.DEFAULT_GOAL := help
.PHONY: help dev-backend dev-frontend build build-backend build-frontend test test-backend \
        test-frontend lint fmt docker-build docker-up docker-down docker-logs backup restore clean

help: ## Show this help
	@echo "Wei Journal"
	@echo
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo "The API listens on http://127.0.0.1:8080 during development,"
	@echo "the interface on http://127.0.0.1:5173."

dev-backend: ## Run the API with automatic reload
	cd $(BACKEND_DIR) && \
	if [ -f ../config.env ]; then set -a; . ../config.env; set +a; fi; \
	if [ -f ../.env ]; then set -a; . ../.env; set +a; fi; \
	WJ_DATA_DIR=$(DATA_DIR) go run ./cmd/server

dev-frontend: ## Run the interface development server
	cd $(FRONTEND_DIR) && npm run dev

build: build-backend build-frontend ## Build the API and the interface

build-backend: ## Compile the API binary
	cd $(BACKEND_DIR) && go build -trimpath -o server ./cmd/server

build-frontend: ## Compile the interface
	cd $(FRONTEND_DIR) && npm ci && npm run build

test: test-backend test-frontend ## Run every test suite

test-backend: ## Run the backend test suite
	cd $(BACKEND_DIR) && go test ./...

test-frontend: ## Run the frontend test suite
	cd $(FRONTEND_DIR) && npm run test

lint: ## Vet the backend sources
	cd $(BACKEND_DIR) && go vet ./...

fmt: ## Format the backend sources
	cd $(BACKEND_DIR) && go fmt ./...

docker-build: ## Build the container images
	docker compose build

docker-up: ## Start the whole stack
	docker compose up -d

docker-down: ## Stop the stack
	docker compose down

docker-logs: ## Follow the logs of the stack
	docker compose logs -f

backup: ## Create a consistent backup of the database
	@mkdir -p $(BACKUP_DIR)
	@if command -v sqlite3 >/dev/null 2>&1; then \
		sqlite3 $(DATA_DIR)/journal.db ".backup '$(BACKUP_FILE)'" && echo "backup written to $(BACKUP_FILE)"; \
	else \
		echo "sqlite3 is not installed, cannot create a consistent backup"; \
		echo "install the sqlite3 command line tool or use docker compose exec backend"; \
		exit 1; \
	fi

restore: ## Restore the database from BACKUP_FILE
	@test -f $(BACKUP_FILE) || { echo "no such file: $(BACKUP_FILE)"; exit 1; }
	@echo "This replaces $(DATA_DIR)/journal.db. Stop the stack first."
	@read -p "Continue? [y/N] " answer; \
		case "$$answer" in \
			y|Y) cp $(BACKUP_FILE) $(DATA_DIR)/journal.db && echo "restored" ;; \
			*) echo "aborted" ;; \
		esac

clean: ## Remove build output
	rm -f $(BACKEND_DIR)/server
	rm -rf $(FRONTEND_DIR)/dist
