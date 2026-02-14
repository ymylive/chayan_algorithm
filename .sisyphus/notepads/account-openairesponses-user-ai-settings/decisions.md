# Decisions

- Chose additive updates in `db/schema.sql` (instead of introducing migration files) to match current repository structure, which currently has only a canonical schema file under `db/`.
- Stored per-user AI settings in `user_ai_settings.settings_json` with a one-row-per-user unique constraint on `user_id` to keep Task 1 minimal and backward-compatible for later API work.
- Added explicit migration artifacts under `db/migrations/` with paired up/down SQL to satisfy Task 1 acceptance criteria while keeping existing `db/schema.sql` changes intact.

## 2026-02-14 Task 5
- Keep default protocol as ; enable Responses path only when  resolves to .
- Preserve deterministic error mapping by reusing existing status +  +  semantics for timeout/rate-limit/provider failures.
- Scope limited to non-streaming adapter path only; streaming/tool lifecycle intentionally deferred to Task 6.

## 2026-02-14 Task 5 (correction)
- Keep default protocol as chat_completions; enable Responses path only when AI_PROTOCOL resolves to responses.
- Preserve deterministic error mapping by reusing existing status + retryAfterSec + limitHint semantics for timeout/rate-limit/provider failures.
- Scope limited to non-streaming adapter path only; streaming/tool lifecycle intentionally deferred to Task 6.

## 2026-02-14 Task 1 continuation
- Kept Task 1 scope minimal: retained existing migration/test artifacts as-is since they already match acceptance criteria, and only performed re-validation attempts.

## 2026-02-14 Task 2
- Implemented password storage for DB users with salted `scrypt` hashes (`scrypt$<salt>$<hash>`) using Node `crypto`, avoiding new dependencies.
- Kept route wiring minimal in `backend/app.js`: only added explicit `register` public route plus authenticated `logout`/`me` routes.
- Preserved auth response envelope shape from existing login flow (`success`, `expiresIn`, `data.user`) and continued to avoid returning raw JWT in JSON.

## 2026-02-14 Task 2 follow-up
- Kept the fix minimal and local: only changed register success to HTTP 201 and added one test assertion, without touching login/logout/me behavior.

## 2026-02-14 Task 3
- Kept Task 3 scoped to middleware and middleware tests only: no controller updates were made.
- Normalization is applied immediately after `jwt.verify(...)` so issuer/audience/algorithm validation behavior and 401 error paths stay unchanged.

## 2026-02-14 Task 4
- Introduced a dedicated backend service (`aiSettingsService`) to keep controller validation/response flow stable while moving persistence to `user_ai_settings`.
- Chose `req.user.id` as the ownership key; requests without DB-backed user identity are rejected with `403 Forbidden` to avoid ambiguous shared settings writes.
- Kept update contract unchanged (`{ success: true, message: 'Settings updated' }`) and retained immediate `process.env` sync after successful per-user save.

## 2026-02-14 Task 4 fix
- Removed controller-level `process.env` synchronization for per-user updates to eliminate cross-user seed leakage risk.
- Preserved response contract and per-user DB ownership path; change is limited to removing global runtime mutation side effects.

## 2026-02-14 Task 4/8 integration fix
- Kept patch scoped to Task 4 backend only: expanded per-user settings schema handling in existing service/controller rather than introducing new modules/routes.
- Stored `modelFallbacks` as deterministic comma-separated string to support both array and string client inputs while staying compatible with existing AI service parsing.
- Applied masking + placeholder protection to both `apiKey` and `secondaryApiKey` to maintain secret handling consistency.

## 2026-02-14 Task 7
- Implemented session bootstrap in router guard (not global app init) to keep auth checks localized to navigation and preserve existing route protection semantics.
- Added logout action to `MainLayout` header and always clear local session state in `finally` so UI state is reset even if `/auth/logout` request fails.
- Extended global 401 redirect guard to treat `/register` like `/login` and avoid auth-page redirect loops.

## 2026-02-14 Task 6
- Kept `/api/mcp/ai-analyze` non-stream JSON envelope unchanged and added streaming behavior behind request flag `stream=true` on the same endpoint.
- Implemented Responses tool lifecycle only through MCP allowlisted tools (`search_industry`, `search_competitors`, `fetch_market_report`, `fetch_financial_data`) to avoid untrusted tool dispatch.
- Preserved Task 5 adapter boundary by extending `openaiResponsesAdapter` for SSE/function-call parsing while keeping non-stream normalization (`content`, `finishReason`, `modelUsed`) as the source-of-truth contract.

## 2026-02-14 Task 8
- Kept Task 8 scope frontend-only by extending `AISettings.vue` payload/UI fields without touching backend routes or auth/session flows.
- Added protocol/fallback-chain controls as additive fields (`protocol`, `fallbackModel`, `modelFallbacks`, `secondaryApiEndpoint`, `secondaryApiKey`, `secondaryModel`) while preserving existing `/settings/ai` save/load endpoint usage.
- Preserved masked-secret semantics by keeping `'********'` as display placeholder after successful saves and converting placeholder writes into empty secret payloads.

## 2026-02-14 Task 9
- Executed final regression gate as verification-only work: no business-logic changes and no dependency changes.
- Used diagnostics + source-target verification as fallback evidence, but kept overall gate verdict blocked because mandatory runtime commands could not execute.
- Recorded pass/fail matrix with explicit blocker reason instead of inferring green status from prior task-level checks.
