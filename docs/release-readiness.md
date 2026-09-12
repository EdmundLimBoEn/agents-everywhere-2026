# Release readiness

The supported deployment is one Chrome extension installation using a local Bun backend and local SQLite storage. Keep `HOST=127.0.0.1`; a hosted, shared backend needs its own deployment and operational verification. Automated checks establish a local release candidate, not successful school authorization or a live teaching session.

Verified locally on September 12, 2026: frozen dependency installation, strict typechecking, 99 service/build tests, 27 Chromium tests, and both bundles passed. The dependency audit reported no known vulnerabilities. Three service tests and two browser tests requiring live providers were skipped. The documented SQLite backup was separately exercised against committed WAL data and reopened successfully. These results apply to the local macOS/Bun environment; CI still needs to run the same gates on Linux.

## Release checks

Use Bun 1.3.14, as declared in `app/package.json` and CI. From `app/`:

```sh
bun install --frozen-lockfile
bun run audit
bun run check
bunx playwright install chromium
E2E_PORT=8796 DATABASE_PATH=:memory: CI=1 bun run test:e2e --workers=2
```

The browser checks use mocked integrations and an isolated, in-memory test database. Select an unused port if 8796 is occupied. On Linux, install Chromium's system dependencies with `bunx playwright install --with-deps chromium`, as CI does.

`check` enforces strict TypeScript and unused-code checks, runs the service, extension-boundary, storage, HTTP, and build tests, then rebuilds the web and extension bundles. Rebuilds remove only the generated `app/dist/web` and `app/dist/extension` directories, preventing obsolete assets from remaining in a release. Do not place hand-maintained files in either directory.

Regression coverage includes raw double-slash requests attempting to read outside the static root, malformed URL encoding, private error details, stale build files, server credentials excluded from client bundles, and disk-backed lessons surviving a restart with owner-only database permissions. Existing tests cover account isolation, Google access checks, citation validation, lesson concurrency, assignment drafts, and whiteboard recovery.

After the checks, configure `app/.env`, run `bun run build`, and restart the backend with `bun run start`. Reload the unpacked extension and Classroom tab. Use `/api/status` to confirm configuration is present; its flags do not validate credentials or provider access.

## Dependency fixes

The direct PDF.js dependency requires a patched 6.x release. The lockfile also overrides `lodash-es` to 4.18.1 and `nanoid` to 5.1.16 because the current Excalidraw dependency tree pins affected versions. Nano ID's browser exports remain compatible with the bundled whiteboard; browser tests must pass after changing these overrides. Remove an override when the upstream dependency tree resolves patched versions itself and both the audit and regression checks pass.

Upstream advisories: [PDF.js](https://github.com/mozilla/pdf.js/security/advisories/GHSA-hq66-cqwq-w95j), [Lodash](https://github.com/advisories/GHSA-r5fr-rjxr-66jc), and [Nano ID](https://github.com/advisories/GHSA-28wg-ghj8-5hjv). `bun run audit` checks the complete current lockfile; this list is not a replacement for the audit.

## Local data and recovery

The default database is `app/data/study.sqlite`; `DATABASE_PATH` can select another location. Keep it on durable local storage with access restricted to the backend user. The application creates new data directories with mode 0700 and database files with mode 0600. Credentials belong in the ignored `app/.env`, never in an extension package or repository commit.

For a consistent backup, use SQLite's `.backup` command, which includes committed data still in the write-ahead log. With the SQLite CLI installed, run from `app/` and choose a new backup filename:

```sh
umask 077
mkdir -p data/backups
sqlite3 data/study.sqlite ".backup 'data/backups/study-before-release.sqlite'"
sqlite3 data/backups/study-before-release.sqlite 'PRAGMA integrity_check;'
```

Adjust both paths if using `DATABASE_PATH`. The integrity check must return `ok`. Backups contain student material and responses; retain them only as needed and protect them like the live database. A backup is not proven recoverable until it has been opened successfully.

To verify recovery without overwriting live data, stop the backend and launch it with `DATABASE_PATH` pointing to a separate copy of the backup. Reconnect the same authorized Google account and verify saved lessons and drafts. Return to the original database path afterward. Do not copy only the main database file while the server is running: committed data may still be in its `-wal` sidecar.

## Checks requiring real accounts

Before use with students, complete the [live demo acceptance checks](hackathon-scope.md#acceptance-checks-before-demo) on an authorized class:

- Verify Google consent, school policy approval where required, correct account selection, real attachments, and a denied attachment.
- Run teaching against real selected sources, open citations, answer incorrectly, resume the lesson, and verify saved work.
- Verify optional voice with the configured model, microphone, and school network.
- If using authoring, review and verify the intended Google Doc or assignment changes with an authorized account.
- Exercise data deletion and a backup recovery using designated test data.

The live-provider tests are opt-in and use the configured API account; see [Build and run](build-and-run.md). No live-provider, school-account, or microphone result is implied by a passing mocked browser suite.

Public distribution also needs an owner-selected project license and the appropriate Google OAuth/extension distribution setup. This repository currently declares no project license and ships an unpacked extension; it does not establish those distribution approvals.
