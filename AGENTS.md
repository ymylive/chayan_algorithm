# AGENTS.md - `chayan_algorithm`
Guide for autonomous coding agents in this repository.
Follow existing patterns first, keep diffs small, and run the right checks.

## Project Layout
- `backend/`: Express API (CommonJS), PostgreSQL, Redis, Python bridge
- `frontend/`: Vue 3 + TypeScript + Vite + Vitest
- `db/`: SQL schema
- Root: no unified npm scripts

## Environment Baseline
- CI Node version: 20 (`.github/workflows/ci.yml`)
- Install dependencies per package:
  - `cd backend && npm ci`
  - `cd frontend && npm ci`

## Build / Test / Lint / Typecheck Commands
### Root (`E:\project\shuju\chayan_algorithm`)
- Build: not defined
- Test: not defined
- Lint: not defined
- Typecheck: not defined

### Backend (`backend/`)
- Start: `npm start`
- Dev: `npm run dev`
- All tests: `npm test`
- Single test file: `npm test -- tests/auth.controller.test.js`
- Single test by name: `npm test -- tests/auth.controller.test.js -t "returns 400 for missing credentials"`
- In-band: `npm test -- --runInBand`
Notes:
- Test runner is Jest (`jest --verbose`)
- No lint script
- No standalone typecheck script

### Frontend (`frontend/`)
- Dev: `npm run dev`
- Build + typecheck: `npm run build`
- All tests: `npm test`
- Single test file: `npm test -- src/router/index.test.ts`
- Single test by name: `npm test -- src/router/index.test.ts -t "redirects unauthenticated access"`
- Preview: `npm run preview`
Notes:
- Test runner is Vitest (`vitest run --environment jsdom`)
- Build runs `vue-tsc -b && vite build`
- No lint script

## CI Contract (Must Pass)
- Backend: `npm ci` -> `npm test`
- Frontend: `npm ci` -> `npm test` -> `npm run build`
- When editing backend, run backend tests
- When editing frontend, run frontend tests and build

## Cursor / Copilot Rules
Scanned locations:
- `.cursorrules`
- `.cursor/rules/`
- `.github/copilot-instructions.md`
Current status:
- No Cursor rules found
- No Copilot instructions found
This file is the active in-repo instruction source.

## Backend Code Style (JavaScript / CommonJS)
### Imports and Modules
- Use `require(...)` and `module.exports`
- Keep imports at top of file
- Typical order: utils -> config clients -> services

### Formatting and Naming
- 2-space indentation
- Single quotes
- Semicolons are used consistently
- `camelCase` for vars/functions
- `UPPER_SNAKE_CASE` for constants/allowlists
- Verb-first handlers (`getAnalysis`, `createAnalysis`, `updateSettings`)

### Validation and SQL Safety
- Validate inputs before DB/service calls
- Use allowlists for sort/order/status/metrics
- Use parameterized SQL (`$1`, `$2`, ...)
- Never build SQL from raw user input

### Error Handling and Logging
- Wrap async controller logic with `try/catch`
- Use logger from `backend/src/config/logger.js` (Winston), not `console.*`
- Typical levels: `info`, `warn`, `error`
- Return explicit HTTP status + JSON body on failure

### Response Shape
- Common helper: `backend/src/utils/responseFormatter.js`
  - `success(data, message?, total?)`
  - `error(message, code?)`
- Repo has mixed response envelopes across modules
- Preserve existing module contract unless task asks to standardize

## Frontend Code Style (Vue 3 + TypeScript)
### Component Patterns
- Use SFCs with `script setup`
- Prefer `<script setup lang="ts">` for new code
- Use Composition API (`ref`, `reactive`, `computed`, `onMounted`)

### Type Discipline
- `frontend/tsconfig.app.json` is strict (`strict`, unused checks)
- Avoid unnecessary `any`
- Prefer local interfaces/types for API payloads and UI models

### Naming, Router, Networking
- `camelCase` for vars/functions
- PascalCase file names for views/components
- Route auth metadata uses `meta.requiresAuth`
- Use shared client `frontend/src/utils/request.ts`
- Keep cookie-auth assumptions (`withCredentials: true`) intact
- Preserve global 401 behavior (clear session marker + redirect)

### Styling
- Use scoped styles for component-local CSS
- Keep responsive behavior compatible with existing mobile checks

## Testing Conventions
### Backend (Jest)
- Tests in `backend/tests/*.test.js`
- Mock infra dependencies (`db`, `jwt`, etc.)
- Use `buildRes()`-style stubs for `res.status().json()` chains

### Frontend (Vitest)
- Examples:
  - `frontend/src/router/index.test.ts`
  - `frontend/src/responsive/mobile-adaptation.test.ts`
- Focus on behavior/contract checks and route guards

## Python Bridge Conventions
- Python scripts are CLI-style (JSON via argv/stdout)
- Preserve output shape expected by Node `pythonBridge`

## Agent Execution Rules
- Keep changes minimal and scoped
- Avoid broad refactors unless requested
- Preserve endpoint/request/response compatibility
- Prefer existing utilities over new patterns
- Run relevant tests after changes

## Quick Recipes
- `cd backend && npm test -- tests/settings.controller.test.js`
- `cd backend && npm test -- tests/auth.controller.test.js -t "does not return JWT"`
- `cd frontend && npm test -- src/router/index.test.ts`
- `cd frontend && npm test -- src/router/index.test.ts -t "redirects unauthenticated"`
- `cd frontend && npm run build`

## Final Notes
- No lint script currently; rely on tests + build/typecheck
- Keep auth/session, DB/cache, and API envelope behavior stable unless requested
