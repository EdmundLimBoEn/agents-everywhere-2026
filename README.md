# Afterclass

An AI teacher that lives inside Google Classroom.

Students open their real class, tick the posts they want help with, and get tutored from those exact documents. Every explanation cites a passage the student can click to open. The tutor checks what the student understands and changes what it teaches next. When a student is behind, **Catch Up** turns the selected posts and the time they have into a short, cited plan.

It is a Chrome extension. Teachers change nothing about how they work, and nothing is written back to Classroom. Between visits, the toolbar badge counts assignments due within 48 hours and a single notification per new deadline points back to the assignment in Classroom.

## Demo

1. Open a class on classroom.google.com. Stream and Classwork work as normal.
2. Tick two posts and click **Study these together**.
3. The attached Docs and PDFs open as readable tabs beside the lesson.
4. Enter the time you have and click **Build my plan**. A scout, planner, tutor, and reviewer produce a few steps that fit the budget, each citing the notes. Click **Start** on the first step.
5. Ask a question that needs both documents. Click a citation to jump to the passage.
6. Click **Teach me**. Answer the diagnostic wrong. Watch the tutor reteach and highlight the teacher's own material, and the plan reorder around the gap.
7. Explain the idea back. Get a recap of what you showed and what to revisit.
8. Close the overlay. You are on the same Classroom page. Reopen to resume.

Full script and acceptance checks: [docs/hackathon-scope.md](docs/hackathon-scope.md).

## How it works

| Piece | Where | Role |
| --- | --- | --- |
| Content script | `app/apps/extension/src/content.ts` | Injects selection controls beside real posts and opens the study overlay in the same tab |
| Service worker | `app/apps/extension/src/background.ts` | Google sign-in with `chrome.identity`. The only place the token lives. Hourly due-soon check: toolbar badge counts assignments due within 48 hours, one notification per new deadline |
| API | `app/services/api` | Bun and SQLite. Verifies the student's Google access, stores lessons, plans, and evidence |
| Classroom client | `app/services/classroom` | Classroom, Drive, and Docs APIs. Reads posts, due dates, and extracts passages from attachments |
| Tutor | `app/services/agent/src/index.ts` | Strict JSON output, verified citations, enforced lesson state machine |
| Catch-up crew | `app/services/agent/src/crew.ts` | Class Scout, Planner, and Reviewer around the tutor. Steps must cite passages and fit the time budget; reviewer and tutor must agree |
| Study UI | `app/apps/web` | Catch Up dashboard, document tabs, lesson thread, whiteboard, optional voice |

Read-only Google scopes only. No grade passback, no submissions.

## Run it

Setup details in [docs/build-and-run.md](docs/build-and-run.md). Short version:

```sh
cd app
bun install
cp .env.example .env   # add GOOGLE_CLIENT_ID and OPENAI_API_KEY; pilot models are preset
bun run build
bun run start
```

Load `app/dist/extension` as an unpacked extension, open a class, click **Study notes**.

## Repo

| Path | Role |
| --- | --- |
| `app/` | Extension, study UI, API, tutor and crew, tests |
| `docs/` | Product, demo script, teaching loop, setup |
| `notes/` | School PDFs to post as materials in the demo class |
| `assets/` | Illustrations for the welcome and empty states |

Rules: do not commit unless asked. Do not invent sample PDFs or demo content. Classroom is the product's home, not an integration.
