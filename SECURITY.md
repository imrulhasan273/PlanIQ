# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in **PlanIQ**, please **do not** open a public GitHub issue with exploit details. Instead, open a private security advisory on GitHub (or contact the maintainer privately) with:
- A description of the issue and affected component.
- Steps to reproduce or a minimal proof-of-concept.

## Security Architecture & Guarantees

- **Read-Only Live Database Connections:** Live SQL Server diagnostics enforce `ApplicationIntent=ReadOnly`, `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED`, and `SET LOCK_TIMEOUT` guards to prevent blocking or data modification.
- **Local Credential Encryption at Rest:** Saved connection profile passwords stored in SQLite (`planiq_config.db`) are encrypted using **AES-256-GCM** with a per-installation key stored in the user's local OS config directory (`0600` permissions).
- **Opt-In Cloud AI & Literal Sanitization:** External AI providers (Google Gemini, OpenAI) are strictly opt-in and only invoked when configured with a user-supplied API key. A built-in literal sanitizer masks string literals, GUIDs, and large numbers before sending query text externally.
- **Offline Deterministic Engine:** All execution plan parsing, deadlock graphing, and deterministic DBA recommendations run locally without network access.
