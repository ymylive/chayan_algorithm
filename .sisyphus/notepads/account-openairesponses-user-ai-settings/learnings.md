# Learnings

- Task 1 schema contract tests can validate DB assumptions by asserting canonical SQL text in `db/schema.sql`, which keeps tests deterministic without requiring a live DB.
- Case-insensitive unique email semantics were implemented with a functional unique index: `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower_unique ON users (LOWER(email));`.
- Migration artifact contracts can be enforced by testing both file presence and SQL content for explicit create/drop semantics in `backend/tests/schema.contract.test.js`.

## 2026-02-14 Task 5
- Added  as the protocol boundary for Responses request/response normalization.
- Responses non-stream request builder now converts chat-style messages into  blocks and supports optional  JSON schema payloads.
- AI service keeps controller-facing compatibility by normalizing Responses output to  used by existing narrative flow.

## 2026-02-14 Task 5 (correction)
- Added openaiResponsesAdapter.js as the protocol boundary for Responses request/response normalization.
- Responses non-stream request builder now converts chat-style messages into input blocks and supports optional text.format JSON schema payloads.
- AI service keeps controller-facing compatibility by normalizing Responses output to { content, finishReason, modelUsed } used by existing narrative flow.

## 2026-02-14 Task 1 continuation
- Existing Task 1 migration artifacts already satisfy required forward/rollback SQL semantics; continuation work validated artifact presence and contract coverage without further schema changes.

## 2026-02-14 Task 2
- Auth API can keep legacy admin env login compatibility while adding DB-user auth by checking `users` first, then preserving existing `ADMIN_USER`/`ADMIN_PASSWORD_HASH` fallback.
- Register auto-login can reuse the existing login cookie semantics (`auth_token`, `httpOnly`, `sameSite=lax`, production-only secure) to stay contract-compatible.
- Deterministic duplicate email behavior is cleanly handled by mapping Postgres unique violation (`code=23505`) to a fixed `409 Email already exists` response.

## 2026-02-14 Task 2 follow-up
- QA required register success status `201`; using `res.status(201)` before the existing auth envelope keeps payload and cookie behavior unchanged.

## 2026-02-14 Task 3
- Auth middleware now normalizes verified JWT claims into a stable `req.user` shape (`id`, `email`, `username`, `role`) while preserving existing JWT metadata fields.
- Compatibility is maintained for both legacy admin claims (`{ username, role }`) and DB-user claims (`{ id, email, role }`) without changing token parsing order (Bearer first, then `auth_token` cookie).

## 2026-02-14 Task 4
- Per-user AI settings can be seeded safely by composing `DEFAULT_SETTINGS` + legacy `data/ai-settings.json` + env overrides once on first `user_id` access.
- Keeping secret masking unchanged (`apiKey` -> `********` in reads, placeholder ignored on writes) preserves existing frontend behavior while moving storage to DB scope.
- User isolation is enforced by querying/upserting `user_ai_settings` with `WHERE user_id = $1` and no global settings fallback in controller paths.

## 2026-02-14 Task 4 fix
- Per-user save flow must not mutate `process.env`; otherwise one user's update can become another user's seed input on first access.
- Regression guard is strongest when asserting all AI-related env keys remain unchanged after a successful per-user `POST /api/settings/ai` call.

## 2026-02-14 Task 4/8 integration fix
- Per-user settings normalization must include protocol/fallback/secondary fields or DB-backed reads silently drop frontend fallback controls.
- `modelFallbacks` can be normalized deterministically by accepting array or comma string input, trimming/de-duplicating in order, and storing as a canonical comma string.
- Secondary secret masking needs parity with primary key masking to keep GET payload safe while preserving placeholder-on-write semantics.

## 2026-02-14 Task 7
- Router auth can remain compatible with the existing `session_active` flag while adding cookie-based bootstrap by calling `/auth/me` inside `beforeEach` for protected routes.
- Public auth pages should share redirect-loop normalization (`/login` and `/register` both collapse to `/`) to preserve current login redirect behavior.
- Keeping register and login forms visually aligned reduces UX drift and keeps auth flows consistent with existing Element Plus patterns.

## 2026-02-14 Task 6
- Responses streaming parsing is more reliable when SSE framing is buffered and parsed on `\n\n` boundaries, with a final flush to consume trailing partial chunks.
- Tool-call safety is strongest when validation happens before MCP connection: allowlist tool names, require JSON object arguments, and enforce per-tool argument schemas.
- Deterministic streaming termination is easier to keep stable by always emitting a single terminal `ai_analyze.completed` (or `ai_analyze.error`) event from controller and then closing the stream.

## 2026-02-14 Task 8
- Frontend can stay backward-compatible with mixed backend shapes by accepting `modelFallbacks` as either comma-string or array and normalizing to a comma-separated form value.
- Secret placeholders should be sanitized before submit (`'********'` -> empty write) and re-masked after success to avoid accidental plaintext redisplay in settings forms.
- Contract tests can enforce settings UI/API bindings in this repo even without Vue component mounting by validating key payload/validation snippets in `AISettings.vue` source.

## 2026-02-14 Task 9
- Regression gate evidence can still include strong static verification when runtime execution is blocked: targeted file presence checks plus LSP diagnostics on cross-stack changed files.
- `lsp_diagnostics` returned zero diagnostics for all inspected regression targets (backend auth/settings/ai/controller files and frontend router/settings/auth view files).
- Final gate status must be reported as blocked (not passed) when mandatory suite/build/API commands cannot execute, even if diagnostics are clean.

## 2026-02-14 Task 9 rerun
- Evidence files for the required final-gate artifacts should still be created when commands cannot start, with exact stderr and explicit `blocked` status.
- Re-running `lsp_diagnostics` across backend and frontend regression targets remained clean (zero diagnostics) and is useful supporting evidence, but it does not satisfy runtime gate acceptance.
- Task 9 must stay unchecked until backend tests, frontend tests, frontend build, and auth-negative API runtime checks all execute successfully.

## 2026-02-14 Task 9 runtime root cause
- `C:\Program Files\Git\bin\bash.exe` exists, but `C:\Program Files\Git\usr\bin\bash.exe` is missing on this machine.
- The `functions.bash` runner resolves to `...\usr\bin\bash.exe`, so all runtime verification commands fail before process start.

## 2026-02-14 Task 9 unblock exploration
- OpenCode desktop state under `C:\Users\Ymy_l\AppData\Roaming\ai.opencode.desktop` is stored in binary `.dat` files (`opencode.settings.dat`, `opencode.global.dat`) and cannot be inspected/edited with current toolset.
- No editable text config key for bash path was found in `C:\Users\Ymy_l\.config\opencode`, `C:\Users\Ymy_l\AppData\Local\OpenCode`, or `C:\Users\Ymy_l\AppData\Local\oh-my-opencode`.

## 2026-02-14 Task 9 filesystem detail
- `C:\Program Files\Git\usr\bin` contains `sh.exe` but no `bash.exe`; this keeps the runner unresolved because it explicitly tries `...\usr\bin\bash.exe`.

## 2026-02-14 Task 9 auth fallback fix
- In `login`, wrapping DB user lookup in a local try/catch allows legacy admin credential evaluation to continue when the query throws, keeping invalid admin attempts deterministic at `401 Invalid credentials` instead of bubbling to a generic `500`.

## 2026-02-14 Task 9 AI settings contract alignment
- Contract assertion for `secondaryApiKey` must follow the same secure write path as primary key and expect `sanitizeSecretWrite(form.secondaryApiKey)`.

## 2026-02-14 Task 9 final gate pass
- Full backend suite (`cd backend && npm test`) and frontend suite/build (`cd frontend && npm test`, `cd frontend && npm run build`) now pass and were captured in Task 9 evidence files.
- Runtime negative auth scenario can stay deterministic at `401 Invalid credentials` without reachable DB by keeping legacy admin fallback active and starting backend with explicit auth envs for the curl check.
