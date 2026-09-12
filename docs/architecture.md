# About the architecture

The ChatGPT chat locked a TypeScript-first monorepo with two clients, services, and shared contracts. A later product lock puts Google Classroom at the center. Intelligence, Classroom, and product UI meet only through OpenAPI, events, and agent tool schemas.

## Where traffic starts

A Classroom iframe hits Next.js on Cloudflare Workers. The add-on validates `login_hint`, exchanges Google OAuth, and calls `getAddOnContext`. From then on the lesson is keyed by `courseId`, `itemId`, `itemType`, and `attachmentId`.

Companion web and iOS routes accept the same ids. They do not create a lesson that is not bound to a Classroom item except in local mocks.

## Platforms

The Classroom add-on plus the rest of the web app share one Next.js codebase. Stack is Next.js, TypeScript, and Cloudflare Workers.

The iOS app is native SwiftUI. Extra native pieces are push notifications, native audio, and PencilKit. No Live Activities. If only one machine can run Xcode, all Swift work stays there.

## Voice

The client talks to OpenAI Realtime for audio. The client talks to our backend for tools and application state. The backend issues short-lived Realtime credentials. The main OpenAI key never ships to the client.

Classroom iframes allow the microphone. Voice on the assignment is the default. Opening the companion app is optional.

## Classroom service

`app/services/classroom` owns Google tokens, Classroom REST calls, add-on attachment create, submission turn-in, and draft grade passback. It syncs courses, coursework, materials, announcements, and submissions into relational rows. Machine 2 reads those rows and the live API through tools. It does not hold OAuth secrets.

## Realtime and persistence

Lesson state, messages, whiteboard changes, agent actions, mastery updates, and Classroom submission changes travel over WebSockets plus an event log. A student can leave the iframe and resume the same Classroom item on iOS.

Canonical entities stay relational. Object storage holds PDFs, images, and board snapshots. A vector store holds embeddings. A graph store holds topic and prerequisite links. Classroom ids are foreign keys, not optional metadata.

Do not pick D1 only because the frontend is on Cloudflare. Pick the best free tier per workload. Prefer hosted cloud. Use a Linux box only if something cannot move.

## Agent runtime

One visible teaching agent. Hidden specialists cover retrieval, lesson planning, marking, question generation, mastery, whiteboard planning, memory extraction, and Classroom context. Students never see those as separate characters.

Lessons run on an explicit state machine. Goal selection defaults to the current `courseWork` title and due date. Critical transitions are deterministic. Teaching-path choices can be model-selected.

## Tool boundary

GPT Live may call backend tools directly. Every call uses a strict schema and server-side validation. Machine 1 owns transport, Classroom OAuth, and execution. Machine 2 owns teaching intelligence and RAG.

## Folder map in this repo

The chat used `/apps`, `/services`, `/packages`, `/content`. This repo keeps those elements under `app/` so `notes/` and `docs/` stay first-class at the root.

| Chat path | This repo |
| --- | --- |
| `/apps/web`, `/apps/ios` | `app/apps/web`, `app/apps/ios` |
| add-on iframes (new) | `app/apps/web/src/classroom-addon` |
| `/services/api`, `realtime`, `agent`, `rag`, `jobs` | `app/services/...` |
| Classroom API client (new) | `app/services/classroom`, `app/packages/classroom-api` |
| `/packages/*` | `app/packages/*` |
| `/content/raw` | `notes/` plus `notes/classroom-links.yaml` |
| `/scripts/ingest`, `evaluate` | `app/scripts/...` |
| Classroom sync (new) | `app/scripts/classroom-sync` |
| `/infra` | `app/infra` |

## Model routing

Do not hardcode OpenAI model names. Ask Edmund before implementing routing for live voice, the main teaching agent, ingestion, retrieval support, question generation, marking, memory extraction, and cheap background tasks.
