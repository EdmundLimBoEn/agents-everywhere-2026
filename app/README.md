# Afterclass app

Chrome extension + vanilla TypeScript study UI + Bun API + SQLite. Real Classroom materials feed adaptive teaching, a time-budgeted Catch Up plan from a scout, planner, tutor, and reviewer, passage citations, a shared board, learner memory, and optional Realtime voice.

Follow [Build and run](../docs/build-and-run.md) for Google OAuth, model configuration, extension installation, data deletion, and live demo verification.

```sh
bun install
cp .env.example .env
# Configure Google and OpenAI in .env.
bun run build
bun run start
```

Load `dist/extension` as an unpacked Chrome extension. Run `bun run check` for typechecks, service tests, and builds; `bun run test:e2e` runs browser checks after installing Playwright Chromium.

Implemented entrypoints are `apps/extension/src`, `apps/web/src` (study UI and Catch Up dashboard), `services/api/src`, `services/classroom/src`, `services/agent/src` (tutor and crew), and `services/realtime/src`. Classroom URL parsing shared by the extension and server lives in `packages/classroom-api/src/route.ts`. Shared lesson types live in `packages/shared-types/src/study.ts`; the HTTP contract is [OpenAPI](packages/openapi/openapi.json).
