# Contributing to PlanIQ

Thank you for your interest in improving **PlanIQ**!

## Development Setup

### Prerequisites
- **Go 1.26+**
- **Node.js 18+** (or 20 LTS)
- **Wails CLI v2** (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`) — only needed for desktop builds.

### Running Locally
- **Web mode (Frontend only):**
  ```bash
  cd frontend
  npm install
  npm run dev
  ```
- **Desktop app (Go + React via Wails):**
  ```bash
  wails dev
  ```

### Running Checks Before Opening a PR
1. Backend checks & unit tests:
   ```bash
   go vet ./...
   go test -v ./...
   ```
2. Frontend type-check & production bundle:
   ```bash
   cd frontend
   npm run build
   ```

## Privacy & Sample Data Rules (Strictly Enforced)
- **NEVER commit real production `.sqlplan`, `.xml`, `.xdl`, or `.json` files**, internal database schemas, hostnames, connection strings, or API keys.
- Use minimal synthetic plans (such as `pkg/sqlplan/sample_plan.sqlplan` and `frontend/src/sample_pg_plan.json`) when adding tests or examples.

## Pull Request Guidelines
- Keep changes focused and modular.
- Add or update unit tests for new diagnostic rules, parsers, or persistence logic.
- Follow standard commit prefixes (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`).
