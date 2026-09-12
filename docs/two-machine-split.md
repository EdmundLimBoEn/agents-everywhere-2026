# Two-machine split

Two machines share one monorepo. Do not casually edit folders the other machine owns. Integrate through OpenAPI, `app/packages/schemas`, `app/packages/events`, and `app/packages/agent-tools`.

## Machine 1

Owns the Classroom add-on, Google OAuth, Classroom REST transport, the web app, iOS app, API gateway, sessions, realtime sync, whiteboard execution, voice transport, push delivery, persistent app state, and the developer observability UI.

Primary tree:

```text
app/apps/web
app/apps/ios
app/services/api
app/services/realtime
app/services/classroom
app/packages/openapi
app/packages/events
app/packages/shared-types
app/packages/classroom-api
app/scripts/classroom-sync
app/infra
```

Coordinate before editing `app/packages/schemas` and `app/packages/agent-tools`.

Build order: monorepo skeleton, OpenAPI and schemas, Google OAuth, Classroom course sync, add-on iframes, relational persistence, Next.js shell, lesson UI bound to `itemId`, mock agent responses, Excalidraw, realtime events, OpenAI Realtime, tool endpoints, turn-in and grade passback, then connect Machine 2, learner profile, developer dashboard, iOS, PencilKit, notifications, polish.

Use mocks until Machine 2 tools exist. Mock Classroom with recorded JSON in `app/services/classroom/fixtures`, not with a fake independent assignment list.

## Machine 2

Owns ingestion of `notes/` and Classroom materials, RAG, embeddings, hybrid search, the knowledge graph, RAGAS, the agent runtime, the lesson state machine, the learner model, memory extraction, practice papers, question generation, marking, teaching strategy, and revision planning.

Primary tree:

```text
app/services/agent
app/services/rag
app/services/jobs
app/packages/rag-core
app/packages/evals
app/packages/agent-runtime
app/scripts/ingest
app/scripts/evaluate
```

Raw PDFs stay in `notes/`. Classroom ids on those files are required.

Build order: shared contracts, ingest one topic linked to one `courseWork`, chunk, embed, hybrid retrieval, citations, golden set, RAGAS, topic graph, practice-paper extraction, learner model, mastery, state machine that reads Classroom context, teaching agent, tools, marking, whiteboard action generation, memory, revision planner, tracing, then more subjects.

## Five-agent view from the build plan

The earlier plan also named five coding agents. Map them onto the two machines.

| Coding agent | Machine | Owns |
| --- | --- | --- |
| Platform / backend | 1 | API, Google OAuth, Classroom client, DB, OpenAPI, WebSockets, events, queues, sessions |
| Web | 1 | Add-on iframes, Next.js companion, lesson, chat, voice, Excalidraw, progress |
| iOS | 1, on the Mac | SwiftUI, PencilKit, voice, push, lesson UI, API client, Classroom deep links |
| RAG | 2 | PDF and Drive parse, chunk, embed, search, rerank, graph, RAGAS |
| Agent runtime | 2 | state machine, prompts, tools, learner model, memory, planner, mastery |

If one machine is a Mac and the other is not, keep all Xcode work on the Mac even if that moves some web work.
