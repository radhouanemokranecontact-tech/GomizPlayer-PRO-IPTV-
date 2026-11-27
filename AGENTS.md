# Project workflow

- Work directly in this project root and keep all source, configuration, and documentation edits in their intended project folders. Do not leave the actual fixes only in temporary directories or detached worktrees; bring any work back into this project before considering it complete.
- For each requested change or repair, run the relevant existing tests and checks, then update the test report with what ran, what passed or failed, and any limits that remain. Do not report a test as passed unless it was run successfully.
- Once checks and the report are current, build the Windows installer variants into `dist/` and verify the generated artifacts and update manifest.
- Upload the completed source and documentation changes to `radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-`. Include the built installer artifacts through an appropriate GitHub release or artifact mechanism when available; do not claim they were uploaded if they remain only in `dist/`.
- Keep release signing requirements intact. Never expose or commit private signing keys. If a required signing key or a GitHub artifact upload capability is unavailable, state that clearly and identify which artifacts remain local.
