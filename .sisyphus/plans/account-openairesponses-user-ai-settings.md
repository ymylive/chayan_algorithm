# Unified Account System + User AI Settings + OpenAI Responses (Full Compatibility)

## TL;DR

> **Quick Summary**: Build a single cohesive upgrade that adds self-registration/login, converts AI settings to per-user ownership, and upgrades the AI integration to full OpenAI Responses compatibility (non-streaming + streaming + tool/function calls + structured output + error mapping) while preserving existing contracts.
>
> **Deliverables**:
> - DB-backed account system (`register/login/logout/me`) with cookie-based auth continuity.
> - Per-user AI settings (including fallback chain) with secret masking and safe defaults.
> - Responses protocol adapter with streaming/tool lifecycle support and backward-safe normalization.
> - Frontend registration/login/session/logout + personal AI settings UX.
>
> **Estimated Effort**: XL
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Task 1 -> Task 2 -> Task 4 -> Task 6 -> Task 8 -> Task 9

---

## Context

### Original Request
- "让ai支持openairesponse协议，并可以在前端实现fallbackai的自主设置"
- Then expanded to: implement account system with self-registration, login, and personal self-managed configuration.

### Interview Summary
**Key Discussions**:
- Scope is unified in one plan (not split): account + per-user AI settings + Responses protocol.
- Registration mode: email + password.
- Registration success behavior: auto-login.
- Email verification: not required in v1.
- Personal config v1 scope: AI settings only.
- Test strategy: TDD.

**Research Findings**:
- Current auth is single-admin env login only; no user table; no register/logout/me endpoints.
- Current AI settings are global file-based (`backend/data/ai-settings.json`) and admin-oriented.
- Current AI generation uses Chat Completions style path; Responses protocol not implemented.
- Frontend has login + route guard + AI settings page patterns, but no registration view/route.
- Test infra exists and is CI-backed (backend Jest, frontend Vitest + build).

### Metis Review
**Identified Gaps (addressed)**:
- Must lock v1 exclusions to prevent scope creep (OAuth/reset/profile/notifications/RBAC).
- Must explicitly preserve cookie + response envelope compatibility.
- Must enforce per-user isolation to prevent cross-user settings leakage.
- Must stage protocol adapter to avoid regression when adding Responses features.

---

## Work Objectives

### Core Objective
Deliver a production-safe v1 where users can register/login and manage their own AI configuration, and where backend AI generation fully supports OpenAI Responses protocol features without breaking existing API response contracts.

### Concrete Deliverables
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- New DB persistence for users + user AI settings
- Per-user `GET/POST /api/settings/ai` behavior (self-owned settings)
- Responses adapter supporting non-streaming, streaming, tool/function, structured output, and mapped errors
- Frontend `Register` flow + session bootstrap + logout action + user AI settings UX

### Definition of Done
- [x] Backend and frontend tests for changed areas pass with TDD artifacts present.
- [x] Frontend build passes.
- [x] Per-user settings isolation verified by automated API scenarios.
- [x] Responses path verified for non-streaming, streaming, tool/function loop, structured output, and error mapping.

### Must Have
- Registration + login + auto-login cookie session.
- Per-user AI settings with fallback chain configurability.
- Full Responses protocol compatibility target.
- Backward-safe controller response envelope.

### Must NOT Have (Guardrails)
- No email verification in v1.
- No password reset/OAuth/profile/avatar/notification modules in v1.
- No RBAC expansion beyond current simple role usage.
- No unrelated refactors across non-affected modules.

---

## Verification Strategy (MANDATORY)

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL verification in this plan is agent-executable. No manual testing steps are allowed.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: TDD
- **Framework**: Backend Jest, Frontend Vitest/jsdom, Frontend build (`vue-tsc -b && vite build`)

### TDD Structure (applies to every task)
1. **RED**: add/extend failing tests first.
2. **GREEN**: implement minimum code to pass.
3. **REFACTOR**: clean internals, keep tests green.

### Agent-Executed QA Scenarios
- Backend/API: Bash + `curl` + focused Jest commands.
- Frontend/UI: Playwright interactions with concrete selectors and screenshots.
- CLI/build: Bash commands with exit-code assertions.

---

## Execution Strategy

### Parallel Execution Waves

```text
Wave 1 (Start Immediately):
├── Task 1: DB schema for users + user settings
└── Task 5: Responses adapter skeleton + contracts/tests

Wave 2 (After Wave 1):
├── Task 2: Auth endpoints (register/login/logout/me)
├── Task 3: Auth middleware/session compatibility hardening
└── Task 4: Per-user settings backend API + seed-from-defaults

Wave 3 (After Wave 2):
├── Task 6: Responses streaming + tool/function lifecycle integration
├── Task 7: Frontend auth UX (register/session/logout)
└── Task 8: Frontend per-user AI settings UX

Wave 4 (After Wave 3):
└── Task 9: End-to-end verification matrix + regression gate

Critical Path: 1 -> 2 -> 4 -> 6 -> 8 -> 9
Parallel Speedup: ~35-45% vs sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|----------------------|
| 1 | None | 2, 4 | 5 |
| 2 | 1 | 3, 7 | 4 |
| 3 | 2 | 6 | 4 |
| 4 | 1, 2 | 6, 8 | 3 |
| 5 | None | 6 | 1 |
| 6 | 3, 4, 5 | 9 | 7, 8 |
| 7 | 2 | 8, 9 | 6 |
| 8 | 4, 7 | 9 | 6 |
| 9 | 6, 7, 8 | None | None |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1, 5 | `task(category="unspecified-high", load_skills=["claudecode-efficient-delivery","logic-quality-gate"], run_in_background=false)` |
| 2 | 2, 3, 4 | parallel after Wave 1 completion |
| 3 | 6, 7, 8 | backend + frontend split execution |
| 4 | 9 | final integration verifier |

---

## TODOs

- [x] 1. Add persistent identity and per-user settings schema

  **What to do**:
  - Add DB migration SQL for `users` and `user_ai_settings` tables with uniqueness, foreign keys, timestamps.
  - Add index/constraint strategy for case-insensitive unique email.
  - Add migration rollback plan and test fixtures.
  - RED-GREEN-REFACTOR: schema contract tests first, then SQL, then cleanup.

  **Must NOT do**:
  - Do not remove existing business tables.
  - Do not break existing startup when migration not yet applied.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: cross-cutting DB contract with backward compatibility concerns.
  - **Skills**: `claudecode-efficient-delivery`, `logic-quality-gate`
    - `claudecode-efficient-delivery`: keeps migration diff minimal and test-backed.
    - `logic-quality-gate`: validates constraints/rollback/failure paths.
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: not relevant for DB schema task.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 5)
  - **Blocks**: 2, 4
  - **Blocked By**: None

  **References**:
  - `db/schema.sql` - current canonical DB shape; new tables must align style and naming.
  - `backend/src/config/database.js` - pg pool access pattern used by controllers/services.
  - `backend/src/controllers/enterpriseController.js` - parameterized SQL style and allowlist patterns.
  - `backend/tests/auth.controller.test.js` - auth contract test style to mirror for new user-backed flow.

  **Acceptance Criteria**:
  - [x] Migration file(s) exist under `db/` and include forward + rollback SQL.
  - [x] New tests for schema assumptions fail before migration and pass after migration in test setup.
  - [x] Existing enterprise/analysis/recommendation tests still pass.

  **Agent-Executed QA Scenarios**:
  ```text
  Scenario: Migration creates identity/settings tables
    Tool: Bash
    Preconditions: Test DB reachable; migration command/script available
    Steps:
      1. Apply migration to test DB
      2. Query information_schema for tables users and user_ai_settings
      3. Assert users.email has unique constraint (case-insensitive behavior covered by test)
      4. Assert user_ai_settings.user_id FK references users.id
      5. Capture query output to .sisyphus/evidence/task-1-schema-check.txt
    Expected Result: Both tables and constraints present
    Failure Indicators: Missing table/constraint/FK
    Evidence: .sisyphus/evidence/task-1-schema-check.txt

  Scenario: Rollback removes only newly added objects
    Tool: Bash
    Preconditions: Migration already applied
    Steps:
      1. Apply rollback
      2. Query information_schema for users and user_ai_settings
      3. Assert both are absent
      4. Assert legacy tables still present (enterprises, analysis_results, recommendations)
      5. Capture output to .sisyphus/evidence/task-1-rollback-check.txt
    Expected Result: New objects removed, legacy objects preserved
    Failure Indicators: Legacy table loss or leftover new tables
    Evidence: .sisyphus/evidence/task-1-rollback-check.txt
  ```

  **Commit**: YES
  - Message: `feat(db): add users and user ai settings schema`
  - Files: `db/schema.sql` or migration files + related tests
  - Pre-commit: backend targeted tests for schema-related contracts

- [x] 2. Implement auth API: register/login/logout/me with auto-login

  **What to do**:
  - Add `POST /api/auth/register` (email+password), hash password, create user, set auth cookie, return success envelope.
  - Extend `POST /api/auth/login` to support DB users while keeping legacy admin env fallback.
  - Add `POST /api/auth/logout` to clear cookie.
  - Add `GET /api/auth/me` to return authenticated user payload.
  - Add duplicate email handling (case-insensitive) and stable error mapping.

  **Must NOT do**:
  - Do not return raw token in JSON body.
  - Do not store plaintext passwords.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: security-sensitive auth contracts and compatibility behavior.
  - **Skills**: `claudecode-efficient-delivery`, `logic-quality-gate`
    - `claudecode-efficient-delivery`: controlled auth diff and focused tests.
    - `logic-quality-gate`: security edge-case checks (duplicate, invalid creds, cookie clear).
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: backend-only deliverable.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4)
  - **Blocks**: 3, 7
  - **Blocked By**: 1

  **References**:
  - `backend/app.js` - route registration and auth middleware ordering.
  - `backend/src/controllers/authController.js` - existing login/cookie style and response envelope.
  - `backend/src/middleware/auth.js` - JWT verification rules and payload attachment to `req.user`.
  - `backend/.env.example` - JWT issuer/audience/expiry/cookie settings contract.
  - `backend/tests/auth.controller.test.js` - existing auth test conventions.

  **Acceptance Criteria**:
  - [x] Register endpoint sets cookie and returns authenticated user payload.
  - [x] Duplicate email registration returns conflict error deterministically.
  - [x] Logout endpoint clears `auth_token` cookie.
  - [x] `/auth/me` returns current user for valid cookie and 401 otherwise.

  **Agent-Executed QA Scenarios**:
  ```text
  Scenario: Register auto-login success
    Tool: Bash (curl)
    Preconditions: Backend running on localhost:8000; clean test email
    Steps:
      1. POST /api/auth/register with {"email":"new.user@test.com","password":"ValidPass123!"}
      2. Assert HTTP 201
      3. Assert Set-Cookie contains auth_token and HttpOnly
      4. Assert response.success is true and response.data.user.email equals new.user@test.com
      5. Save response/cookie to .sisyphus/evidence/task-2-register-success.json
    Expected Result: User created and authenticated immediately
    Failure Indicators: 4xx/5xx, missing cookie, wrong response shape
    Evidence: .sisyphus/evidence/task-2-register-success.json

  Scenario: Duplicate email rejected
    Tool: Bash (curl)
    Preconditions: new.user@test.com already exists
    Steps:
      1. Repeat POST /api/auth/register with same email (different case NEW.USER@test.com)
      2. Assert HTTP 409
      3. Assert response.success is false and message indicates duplicate conflict
      4. Save response to .sisyphus/evidence/task-2-register-duplicate.json
    Expected Result: Case-insensitive duplicate prevented
    Failure Indicators: 200/201 or ambiguous error response
    Evidence: .sisyphus/evidence/task-2-register-duplicate.json
  ```

  **Commit**: YES
  - Message: `feat(auth): add register logout and me endpoints`
  - Files: auth controller, app route wiring, auth tests
  - Pre-commit: `cd backend && npm test -- tests/auth.controller.test.js`

- [x] 3. Harden auth middleware/session compatibility

  **What to do**:
  - Ensure middleware supports both legacy and new JWT claim shapes (`username`/`email`/`userId`).
  - Normalize `req.user` contract for downstream controllers.
  - Keep bearer and cookie parsing behavior stable.
  - Add tests for invalid token, expired token, malformed token, missing token.

  **Must NOT do**:
  - Do not break existing protected routes.
  - Do not change issuer/audience validation semantics silently.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: focused middleware contract hardening with targeted tests.
  - **Skills**: `claudecode-efficient-delivery`, `logic-quality-gate`
    - `claudecode-efficient-delivery`: minimal compatibility changes.
    - `logic-quality-gate`: strict failure-path assertions.
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: no frontend scope here.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 4)
  - **Blocks**: 6
  - **Blocked By**: 2

  **References**:
  - `backend/src/middleware/auth.js` - current token extraction and verification behavior.
  - `backend/tests/auth.middleware.test.js` - existing middleware test matrix pattern.
  - `backend/src/controllers/settingsController.js` - current `req.user.role` dependency.

  **Acceptance Criteria**:
  - [x] Middleware tests cover both legacy and new claim payloads.
  - [x] Protected endpoints still return 401 for invalid/missing tokens.
  - [x] No regression on cookie-based auth path.

  **Agent-Executed QA Scenarios**:
  ```text
  Scenario: /auth/me with valid cookie returns identity
    Tool: Bash (curl)
    Preconditions: Valid auth cookie from Task 2
    Steps:
      1. GET /api/auth/me with cookie jar
      2. Assert HTTP 200
      3. Assert response.data.user contains stable id/email/role fields
      4. Save body to .sisyphus/evidence/task-3-me-success.json
    Expected Result: Auth middleware resolves user correctly
    Failure Indicators: 401 with valid cookie or missing fields
    Evidence: .sisyphus/evidence/task-3-me-success.json

  Scenario: Invalid token rejected
    Tool: Bash (curl)
    Preconditions: Backend running
    Steps:
      1. GET /api/settings/ai with header Authorization: Bearer invalid.token.value
      2. Assert HTTP 401
      3. Assert response.message indicates invalid token/auth required
      4. Save body to .sisyphus/evidence/task-3-invalid-token.json
    Expected Result: Request denied consistently
    Failure Indicators: Non-401 or inconsistent envelope
    Evidence: .sisyphus/evidence/task-3-invalid-token.json
  ```

  **Commit**: YES
  - Message: `fix(auth): normalize middleware claims and compatibility`
  - Files: auth middleware + tests
  - Pre-commit: `cd backend && npm test -- tests/auth.middleware.test.js`

- [x] 4. Convert AI settings API to per-user ownership with default seeding

  **What to do**:
  - Refactor `GET/POST /api/settings/ai` to read/write user-owned settings keyed by authenticated user.
  - Keep secrets masked on read and preserve masked-value semantics on update.
  - Seed first-time user settings from current global defaults (env + legacy file) once.
  - Preserve endpoint URL validation and host allowlist protections.

  **Must NOT do**:
  - Do not allow user A to read/write user B settings.
  - Do not expose plaintext API keys in API responses.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: data isolation + migration-safe behavior + validation continuity.
  - **Skills**: `claudecode-efficient-delivery`, `logic-quality-gate`
    - `claudecode-efficient-delivery`: controlled controller/service evolution.
    - `logic-quality-gate`: cross-user isolation and masking guarantees.
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: backend API scope.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 3)
  - **Blocks**: 6, 8
  - **Blocked By**: 1, 2

  **References**:
  - `backend/src/controllers/settingsController.js` - current global settings load/save and masking semantics.
  - `backend/src/services/aiService.js` - current runtime config resolution using env + file defaults.
  - `backend/tests/settings.controller.test.js` - current validation/admin-guard test style to adapt.
  - `backend/src/middleware/auth.js` - authenticated identity source (`req.user`).

  **Acceptance Criteria**:
  - [x] Settings API is user-scoped and isolated by authenticated identity.
  - [x] First-time user receives seeded defaults from legacy config source.
  - [x] Masked secrets remain masked in GET responses and updates do not overwrite with mask placeholders.

  **Agent-Executed QA Scenarios**:
  ```text
  Scenario: User-specific settings isolation
    Tool: Bash (curl)
    Preconditions: Two users (a@test.com, b@test.com) exist; both can authenticate
    Steps:
      1. Login as user A and POST /api/settings/ai with model "model-a"
      2. Login as user B and POST /api/settings/ai with model "model-b"
      3. GET /api/settings/ai as user A and assert model is "model-a"
      4. GET /api/settings/ai as user B and assert model is "model-b"
      5. Save outputs to .sisyphus/evidence/task-4-user-isolation.json
    Expected Result: Strict per-user isolation
    Failure Indicators: Cross-user value leakage
    Evidence: .sisyphus/evidence/task-4-user-isolation.json

  Scenario: Secret masking and safe update semantics
    Tool: Bash (curl)
    Preconditions: Authenticated user with saved API key
    Steps:
      1. GET /api/settings/ai and assert apiKey is masked (e.g., "********")
      2. POST /api/settings/ai with apiKey set to masked placeholder and changed non-secret field
      3. GET /api/settings/ai again and assert non-secret updated, secret remains stored and masked
      4. Save outputs to .sisyphus/evidence/task-4-secret-mask.json
    Expected Result: No secret leakage, no accidental secret deletion
    Failure Indicators: Plaintext key returned or secret lost due to masked input
    Evidence: .sisyphus/evidence/task-4-secret-mask.json
  ```

  **Commit**: YES
  - Message: `feat(settings): make ai settings user-scoped`
  - Files: settings controller/service + tests
  - Pre-commit: `cd backend && npm test -- tests/settings.controller.test.js`

- [x] 5. Build OpenAI Responses adapter with normalized internal contract

  **What to do**:
  - Introduce protocol adapter abstraction in backend AI service layer.
  - Implement Responses request builder (non-streaming + structured output inputs).
  - Normalize Responses outputs into existing internal narrative contract.
  - Map provider and protocol errors into stable backend statuses/messages.

  **Must NOT do**:
  - Do not directly couple controllers to raw Responses payload format.
  - Do not remove existing Chat Completions compatibility path.

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
    - Reason: protocol translation, normalization, and compatibility logic is high complexity.
  - **Skills**: `claudecode-efficient-delivery`, `logic-quality-gate`
    - `claudecode-efficient-delivery`: minimizes regression footprint.
    - `logic-quality-gate`: validates failure mapping and boundary behavior.
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: protocol/backend domain only.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: 6
  - **Blocked By**: None

  **References**:
  - `backend/src/services/aiService.js` - current chat-completions request/parse/fallback behavior to preserve.
  - `backend/src/controllers/mcpController.js` - consumer contract that must remain stable.
  - `backend/tests/ai.service.test.js` - existing AI service test style/coverage entrypoint.
  - `https://platform.openai.com/docs/api-reference/responses/create` - canonical Responses request semantics.
  - `https://platform.openai.com/docs/guides/structured-outputs` - structured output behavior and constraints.

  **Acceptance Criteria**:
  - [x] Adapter supports Responses non-streaming calls and structured output payloads.
  - [x] Internal normalized return shape remains stable for controller consumers.
  - [x] Error mapping covers timeout/rate-limit/provider errors consistently.

  **Agent-Executed QA Scenarios**:
  ```text
  Scenario: Responses non-streaming text normalization
    Tool: Bash (backend Jest)
    Preconditions: Test mocks for Responses API available
    Steps:
      1. Run target test for adapter success path
      2. Assert normalized output includes text, finishReason, modelUsed
      3. Assert controller-facing shape matches existing contract expectations
      4. Save test output to .sisyphus/evidence/task-5-responses-nonstream.txt
    Expected Result: Stable normalized contract from Responses output
    Failure Indicators: Missing fields or contract drift
    Evidence: .sisyphus/evidence/task-5-responses-nonstream.txt

  Scenario: Responses rate-limit/error mapping
    Tool: Bash (backend Jest)
    Preconditions: Mock 429/timeout/provider failures
    Steps:
      1. Run target test for adapter error path
      2. Assert mapped status/retryAfter/limitHint are populated as expected
      3. Save output to .sisyphus/evidence/task-5-responses-errors.txt
    Expected Result: Deterministic mapped errors
    Failure Indicators: Unmapped/raw errors leaking through
    Evidence: .sisyphus/evidence/task-5-responses-errors.txt
  ```

  **Commit**: YES
  - Message: `feat(ai): add openai responses adapter with normalized contract`
  - Files: ai service/adapter + ai tests
  - Pre-commit: `cd backend && npm test -- tests/ai.service.test.js`

- [x] 6. Implement Responses streaming + tool/function lifecycle with MCP integration

  **What to do**:
  - Add streaming-capable Responses handling in AI service (event parsing, incremental text assembly).
  - Implement tool/function call lifecycle handling and MCP tool dispatch loop.
  - Support structured output completion path in streaming and non-streaming modes.
  - Add or extend controller route(s) to expose streaming safely without breaking existing non-stream endpoint.

  **Must NOT do**:
  - Do not regress existing non-stream `/api/mcp/ai-analyze` response behavior.
  - Do not allow unvalidated tool names/arguments to bypass MCP boundaries.

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
    - Reason: streaming state machine + tool loop orchestration complexity.
  - **Skills**: `claudecode-efficient-delivery`, `logic-quality-gate`
    - `claudecode-efficient-delivery`: surgical integration into existing AI flow.
    - `logic-quality-gate`: race/error/timeout handling assurance.
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: backend protocol lifecycle focus.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 7, 8)
  - **Blocks**: 9
  - **Blocked By**: 3, 4, 5

  **References**:
  - `backend/src/services/aiService.js` - current MCP call/cache and narrative generation boundaries.
  - `backend/mcp-server.js` - available MCP tools and expected payload contracts.
  - `backend/src/controllers/mcpController.js` - current API envelope; streaming route should not break existing route.
  - `backend/tests/mcp.controller.test.js` - controller contract tests to extend.
  - `https://platform.openai.com/docs/api-reference/responses/streaming` - canonical streaming event model.

  **Acceptance Criteria**:
  - [x] Streaming mode emits ordered chunks and final completion with deterministic termination.
  - [x] Tool/function calls trigger MCP dispatch and re-enter response loop correctly.
  - [x] Structured output path validates and normalizes final payload.

  **Agent-Executed QA Scenarios**:
  ```text
  Scenario: Streaming success path emits chunks then completion
    Tool: Bash (curl)
    Preconditions: Backend running; streaming endpoint enabled; test prompt available
    Steps:
      1. POST streaming analyze endpoint with stream=true
      2. Assert response content-type is event-stream (or streaming contract equivalent)
      3. Assert at least one text-delta event is received
      4. Assert final completion event includes finish reason and model metadata
      5. Save stream log to .sisyphus/evidence/task-6-stream-success.log
    Expected Result: Ordered stream and clean completion
    Failure Indicators: No deltas, broken sequence, no completion
    Evidence: .sisyphus/evidence/task-6-stream-success.log

  Scenario: Tool/function call loop executes MCP and resumes output
    Tool: Bash (backend Jest or curl with mocked tool-trigger prompt)
    Preconditions: MCP tool available; prompt crafted to trigger tool call
    Steps:
      1. Send prompt that requires tool invocation
      2. Assert tool-call event captured with valid tool name
      3. Assert MCP tool invoked and tool result fed back into response loop
      4. Assert final output contains tool-informed content
      5. Save trace to .sisyphus/evidence/task-6-tool-loop.json
    Expected Result: End-to-end tool lifecycle completes without deadlock
    Failure Indicators: Stuck loop, invalid tool dispatch, missing final output
    Evidence: .sisyphus/evidence/task-6-tool-loop.json
  ```

  **Commit**: YES
  - Message: `feat(ai): add responses streaming and tool lifecycle`
  - Files: ai service/controller/tests
  - Pre-commit: backend AI + controller focused tests

- [x] 7. Build frontend account UX: register, session bootstrap, logout

  **What to do**:
  - Add `Register` view with email/password form and validation.
  - Add `/register` public route and login/register cross-links.
  - Add app/session bootstrap via `/api/auth/me` and synchronize route guard state.
  - Add logout action in main layout that calls `/api/auth/logout` and clears local session markers.

  **Must NOT do**:
  - Do not break existing login redirect behavior.
  - Do not rely only on `sessionStorage` as source of truth after bootstrap is introduced.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: auth UX flow + router interactions + state handling.
  - **Skills**: `frontend-ui-ux`, `claudecode-efficient-delivery`
    - `frontend-ui-ux`: consistent form UX and route transitions.
    - `claudecode-efficient-delivery`: minimal changes with testable behavior.
  - **Skills Evaluated but Omitted**:
    - `logic-quality-gate`: can be applied globally in final wave, not primary for UI assembly.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 6, 8)
  - **Blocks**: 8, 9
  - **Blocked By**: 2

  **References**:
  - `frontend/src/views/Login.vue` - current auth form and redirect behavior to mirror.
  - `frontend/src/router/index.ts` - route guard and public/protected route patterns.
  - `frontend/src/utils/request.ts` - API client with `withCredentials` and 401 handling.
  - `frontend/src/layouts/MainLayout.vue` - logout entry integration point.
  - `frontend/src/router/index.test.ts` - guard behavior tests to extend.

  **Acceptance Criteria**:
  - [x] `/register` is publicly accessible and form validates required fields.
  - [x] Successful register auto-logs-in and redirects to protected home.
  - [x] Logout clears auth session and returns user to `/login`.
  - [x] Router guard tests cover new register + me-bootstrap behavior.

  **Agent-Executed QA Scenarios**:
  ```text
  Scenario: Registration auto-login in browser
    Tool: Playwright (playwright skill)
    Preconditions: Frontend dev server on localhost:3000; backend on localhost:8000
    Steps:
      1. Navigate to http://localhost:3000/register
      2. Wait for input[name="email"] and input[name="password"]
      3. Fill email: "ui.register@test.com"
      4. Fill password: "ValidPass123!"
      5. Click button[type="submit"]
      6. Wait for navigation to / (timeout: 10s)
      7. Assert main dashboard container exists
      8. Screenshot: .sisyphus/evidence/task-7-register-autologin.png
    Expected Result: User lands in authenticated app directly
    Failure Indicators: Stays on register with error or redirects to login
    Evidence: .sisyphus/evidence/task-7-register-autologin.png

  Scenario: Anonymous user blocked from protected route
    Tool: Playwright (playwright skill)
    Preconditions: Fresh browser context without auth cookie
    Steps:
      1. Navigate to http://localhost:3000/ai-settings
      2. Wait for URL containing /login
      3. Assert login form is visible
      4. Screenshot: .sisyphus/evidence/task-7-protected-redirect.png
    Expected Result: Route guard redirects unauthenticated user
    Failure Indicators: Protected page renders without auth
    Evidence: .sisyphus/evidence/task-7-protected-redirect.png
  ```

  **Commit**: YES
  - Message: `feat(frontend-auth): add register bootstrap and logout flow`
  - Files: login/register views, router, layout, tests
  - Pre-commit: `cd frontend && npm test -- src/router/index.test.ts`

- [x] 8. Build frontend per-user AI settings UX with fallback chain controls

  **What to do**:
  - Extend `AISettings.vue` to user-owned settings semantics (no admin-only assumptions).
  - Add controls for protocol selection, primary model/provider, fallback chain ordering, and optional secondary provider values.
  - Preserve masked-secret UX patterns.
  - Ensure save/load/reset behavior works with new backend contract.

  **Must NOT do**:
  - Do not expose plaintext secret in UI after load.
  - Do not hardcode provider list that conflicts with backend allowlist policy.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: form-heavy UX plus contract binding.
  - **Skills**: `frontend-ui-ux`, `claudecode-efficient-delivery`
    - `frontend-ui-ux`: robust form architecture and validation messaging.
    - `claudecode-efficient-delivery`: avoid visual churn beyond required scope.
  - **Skills Evaluated but Omitted**:
    - `logic-quality-gate`: applied in integration wave, not primary builder.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 6, 7)
  - **Blocks**: 9
  - **Blocked By**: 4, 7

  **References**:
  - `frontend/src/views/AISettings.vue` - existing settings page form/load/save/reset pattern.
  - `frontend/src/utils/request.ts` - API integration and 401 global behavior.
  - `backend/src/controllers/settingsController.js` - expected response/input fields for settings API.
  - `frontend/src/layouts/MainLayout.vue` - navigation path to settings route.

  **Acceptance Criteria**:
  - [x] User can save/load their own AI config including fallback chain and protocol option.
  - [x] Secret fields remain masked on reload.
  - [x] Validation/error messages are explicit and consistent with existing Element Plus usage.

  **Agent-Executed QA Scenarios**:
  ```text
  Scenario: Save and reload personal AI settings
    Tool: Playwright (playwright skill)
    Preconditions: Authenticated user on localhost:3000
    Steps:
      1. Navigate to http://localhost:3000/ai-settings
      2. Fill select/input controls with:
         - protocol: responses
         - model: gpt-4.1
         - fallback model #1: gpt-4.1-mini
         - temperature: 0.6
      3. Click save button
      4. Wait for success message text contains "保存成功"
      5. Reload page
      6. Assert protocol/model/fallback values persist
      7. Assert apiKey input shows masked value (not plaintext)
      8. Screenshot: .sisyphus/evidence/task-8-settings-save-reload.png
    Expected Result: Persisted user-specific settings with masked secrets
    Failure Indicators: Values reset unexpectedly or plaintext secret visible
    Evidence: .sisyphus/evidence/task-8-settings-save-reload.png

  Scenario: Invalid endpoint validation blocks save
    Tool: Playwright (playwright skill)
    Preconditions: Authenticated user on settings page
    Steps:
      1. Fill endpoint field with http://insecure.example.com
      2. Click save
      3. Assert error message visible and save rejected
      4. Screenshot: .sisyphus/evidence/task-8-invalid-endpoint.png
    Expected Result: Validation prevents insecure endpoint submission
    Failure Indicators: Save succeeds with invalid URL
    Evidence: .sisyphus/evidence/task-8-invalid-endpoint.png
  ```

  **Commit**: YES
  - Message: `feat(frontend-settings): support per-user ai fallback configuration`
  - Files: AI settings view/tests/routes as needed
  - Pre-commit: frontend settings-related tests

- [x] 9. Final regression gate: full TDD evidence + integration verification

  **What to do**:
  - Ensure each prior task includes RED->GREEN evidence in commit history/tests.
  - Run targeted backend/frontend suites plus build gate.
  - Execute API/browser smoke scenarios covering auth + user settings + responses behavior.
  - Produce evidence files under `.sisyphus/evidence/` and final validation note.

  **Must NOT do**:
  - Do not mark complete with partial scenario coverage.
  - Do not skip negative/error scenarios.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: cross-stack integration validation and failure-path verification.
  - **Skills**: `logic-quality-gate`, `claudecode-efficient-delivery`
    - `logic-quality-gate`: final boundary/error coverage verification.
    - `claudecode-efficient-delivery`: concise evidence-focused closure.
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: not primary for validation wave.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential final wave
  - **Blocks**: None
  - **Blocked By**: 6, 7, 8

  **References**:
  - `backend/tests/auth.controller.test.js` - auth contract verification.
  - `backend/tests/auth.middleware.test.js` - token/cookie protection verification.
  - `backend/tests/settings.controller.test.js` - user settings validation/isolation.
  - `backend/tests/ai.service.test.js` - Responses adapter and fallback behavior.
  - `backend/tests/mcp.controller.test.js` - API-level AI analyze contract stability.
  - `frontend/src/router/index.test.ts` - auth guard contract.

  **Acceptance Criteria**:
  - [x] `cd backend && npm test` passes.
  - [x] `cd frontend && npm test` passes.
  - [x] `cd frontend && npm run build` passes.
  - [x] API and browser QA scenarios have evidence artifacts.

  **Agent-Executed QA Scenarios**:
  ```text
  Scenario: Full backend test suite gate
    Tool: Bash
    Preconditions: Backend dependencies installed
    Steps:
      1. Run cd backend && npm test
      2. Assert exit code 0
      3. Save output to .sisyphus/evidence/task-9-backend-tests.txt
    Expected Result: Backend test suite green
    Failure Indicators: Any failing test
    Evidence: .sisyphus/evidence/task-9-backend-tests.txt

  Scenario: Frontend test+build gate
    Tool: Bash
    Preconditions: Frontend dependencies installed
    Steps:
      1. Run cd frontend && npm test
      2. Assert exit code 0
      3. Run cd frontend && npm run build
      4. Assert exit code 0
      5. Save outputs to .sisyphus/evidence/task-9-frontend-gate.txt
    Expected Result: Frontend tests and build both green
    Failure Indicators: Any test/build failure
    Evidence: .sisyphus/evidence/task-9-frontend-gate.txt

  Scenario: Auth error path remains deterministic
    Tool: Bash (curl)
    Preconditions: Backend running; invalid credentials available
    Steps:
      1. POST /api/auth/login with {"email":"notfound@test.com","password":"WrongPass123"}
      2. Assert HTTP 401
      3. Assert response.success is false and contains stable error message/envelope
      4. Save output to .sisyphus/evidence/task-9-auth-negative.json
    Expected Result: Invalid login consistently rejected
    Failure Indicators: 200/201 or malformed error body
    Evidence: .sisyphus/evidence/task-9-auth-negative.json
  ```

  **Commit**: NO
  - Message: N/A (verification wave)
  - Files: evidence only
  - Pre-commit: N/A

---

## Commit Strategy

| After Task | Message | Files | Verification |
|-----------|---------|-------|--------------|
| 1 | `feat(db): add users and user ai settings schema` | db schema/migration + tests | backend schema-focused tests |
| 2 | `feat(auth): add register logout and me endpoints` | auth controller/routes/tests | auth controller tests |
| 3 | `fix(auth): normalize middleware claims and compatibility` | auth middleware/tests | middleware tests |
| 4 | `feat(settings): make ai settings user-scoped` | settings controller/service/tests | settings tests |
| 5 | `feat(ai): add openai responses adapter with normalized contract` | ai service/adapter/tests | ai service tests |
| 6 | `feat(ai): add responses streaming and tool lifecycle` | ai service/controller/tests | ai + mcp controller tests |
| 7 | `feat(frontend-auth): add register bootstrap and logout flow` | frontend auth views/router/layout/tests | router/auth tests |
| 8 | `feat(frontend-settings): support per-user ai fallback configuration` | frontend settings view/tests | frontend settings tests |

---

## Success Criteria

### Verification Commands
```bash
cd backend && npm test
# Expected: all backend tests pass

cd frontend && npm test
# Expected: all frontend tests pass

cd frontend && npm run build
# Expected: typecheck and build succeed
```

### Final Checklist
- [x] Registration/login/logout/me contract works with cookie auth.
- [x] Legacy admin login compatibility path still functions (deprecated but not broken).
- [x] Each user sees only their own AI settings.
- [x] Responses protocol full compatibility target verified (non-streaming, streaming, tool/function, structured output, error mapping).
- [x] No v1-excluded features were added.
- [x] Evidence artifacts exist for all mandatory QA scenarios.
