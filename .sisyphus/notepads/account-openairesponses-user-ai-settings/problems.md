# Problems

- 2026-02-14: Local shell runtime for `functions.bash` is blocked because `C:\Program Files\Git\usr\bin\bash.exe` is missing; command-based verification is currently unavailable.
- 2026-02-14 (Task 6): Focused Jest verification for streaming/tool-loop changes cannot execute until the shell runtime path issue is fixed.

- 2026-02-14 (Task 9): Final regression gates are blocked by the same missing shell binary, so full-suite and API runtime checks cannot start.
- 2026-02-14 (Task 9 unblock suggestion): install Git for Windows with `usr/bin/bash.exe` at `C:\Program Files\Git\usr\bin\bash.exe` (or repair PATH/runtime mapping used by `functions.bash`), then rerun `cd backend && npm test`, `cd frontend && npm test`, `cd frontend && npm run build`, and invalid-login curl check.

- 2026-02-14 (Task 9 rerun): blocker persists unchanged; mandatory runtime verification remains unexecutable and task cannot be closed.
- 2026-02-14 (Task 9 rerun missing outcomes): expected pass/fail assertions for backend suite, frontend suite/build, and invalid-login HTTP envelope remain unavailable until shell runtime is repaired.

- 2026-02-14 (Task 9 root cause): the environment has `C:\Program Files\Git\bin\bash.exe` but lacks `C:\Program Files\Git\usr\bin\bash.exe`, while `functions.bash` resolves to the missing `usr\bin` path.
- 2026-02-14 (Task 9 unblock path): repair Git Bash installation so `usr\bin\bash.exe` exists, or reconfigure the runner to use `C:\Program Files\Git\bin\bash.exe`, then rerun all Task 9 gates.

- 2026-02-14 (Task 9 unblock exploration): no editable text-based OpenCode config key for shell path was discoverable; desktop state is persisted in binary `.dat` files, preventing direct patch via current toolset.
- 2026-02-14 (Task 9 blocker ownership): environment-level repair (Git Bash reinstall/repair or runtime mapping update by host tooling) is required before any remaining automated verification can proceed.

- 2026-02-14 (Task 9 gate retry): repeated retries of all mandatory runtime gates still fail pre-execution with missing `C:\Program Files\Git\bin\..\usr\bin\bash.exe`; final regression closure remains blocked.

- 2026-02-14 (Task 9 gate retry latest): blocker reproduced again with no variance across backend test, frontend test, frontend build, and curl negative-auth checks; completion is impossible until shell runtime mapping is repaired.

- 2026-02-14 (Task 9 continuation loop): plan remains at 41 unchecked items; no additional in-repo workaround exists while `functions.bash` cannot launch due missing `C:\Program Files\Git\usr\bin\bash.exe`.

- 2026-02-14 (Task 9 blocker verification): explicit file check still reports `C:\Program Files\Git\usr\bin\bash.exe` absent, so Task 9 runtime gates remain impossible to execute.

- 2026-02-14 (Task 9 post-fix verification): runner target remains missing after user-reported fix (`usr\bin` has `sh.exe` but no `bash.exe`), so no command-based verification can proceed.

- 2026-02-14 (Task 9 resolution): shell runner became usable in-session (`functions.bash` restored), allowing completion of full regression gates and evidence capture.
