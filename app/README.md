# App

TypeScript-first monorepo for the Classroom teaching agent. Use Bun. Shared contracts live in `packages/`. Classroom is not optional.

## Tree

```text
app/
  apps/web                 Next.js. Add-on iframes plus companion UI.
  apps/ios                 Native SwiftUI companion.
  services/api             HTTP + OpenAPI.
  services/realtime        WebSockets and event log.
  services/classroom       Google OAuth, Classroom REST, grade passback.
  services/agent           Teaching runtime.
  services/rag             Retrieval over notes and Classroom materials.
  services/jobs            Ingest, sync, memory, RAGAS.
  packages/schemas         Domain types.
  packages/events          Event names.
  packages/agent-tools     Tool schemas.
  packages/classroom-api   Classroom client types and scopes.
  packages/openapi         API source of truth.
  packages/shared-types    Cross-package TS types.
  packages/rag-core        Chunk and retrieval types.
  packages/evals           Golden set and RAGAS hooks.
  packages/agent-runtime   State machine types.
  scripts/ingest           notes/ + Drive ingest.
  scripts/evaluate         RAG evals.
  scripts/classroom-sync   Pull courses and coursework.
  infra                    Cloudflare and OAuth config notes.
```

Machine ownership is in [Two-machine split](../docs/two-machine-split.md).
