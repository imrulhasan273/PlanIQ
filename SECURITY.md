# Security Policy

## Supported Versions

Security patches are released on the latest minor version of PlanIQ:

| Version | Supported |
| :--- | :---: |
| `1.x` | ✅ Active |

## Reporting a Vulnerability

If you discover a security vulnerability in **PlanIQ**, please **do not** open a public GitHub issue with exploit details.

Instead, report it privately via **GitHub Private Vulnerability Reporting**:
1. Open the repository's **Security** tab on GitHub.
2. Click **Advisories** → **Report a vulnerability**.
3. Include:
   - Affected component and version/commit.
   - Steps to reproduce or a minimal proof-of-concept.
   - Potential impact and any suggested remediation.

You can expect an initial acknowledgment within **72 hours** and status updates as a fix is prepared and released.

## Security Architecture & Guarantees

- **Offline-First Plan & Deadlock Analysis:** All SQL Server ShowPlan XML (`.sqlplan`/`.xml`), PostgreSQL `EXPLAIN (FORMAT JSON)` (`.json`), and deadlock graph (`.xdl`) parsing, diagnostics, deterministic tuning rules, and HTML/PNG/SVG exports execute 100% locally with zero network requests.
- **Zero External Frontend CDNs:** Monaco Editor workers, grammars, icons, and styles are bundled locally so PlanIQ works safely in air-gapped enterprise environments.
- **XSS-Safe Standalone HTML Exports:** All plan metadata, SQL text, wait names, and DDL strings interpolated into exported HTML diagnostic reports are strictly HTML-escaped.
- **Read-Only Live Database Connections:** Optional live SQL Server inspection enforces `ApplicationIntent=ReadOnly`, `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED`, parameterized DMV queries, and connection-string escaping (`}` / `;` sanitization) to prevent blocking, data modification, or parameter injection.
- **Local Credential Encryption at Rest:** Saved database connection passwords in SQLite (`planiq_config.db`) are encrypted with **AES-256-GCM** using a per-installation 256-bit random key (`.planiq_key`). Both the config directory (`0700`) and credential/database files (`0600`) are restricted to the local OS user.
- **Opt-In Cloud AI & SQL Literal Sanitization:** External LLM providers (Google Gemini, OpenAI) are strictly opt-in and only invoked when explicitly enabled with a user-supplied API key. A built-in SQL sanitizer (`SanitizeSQL`) masks string literals, GUIDs, and large numbers before sending SQL externally.
- **Verifiable Release Artifacts:** Official GitHub Releases include a `SHA256SUMS.txt` manifest so enterprise teams can verify binary integrity before deployment.
