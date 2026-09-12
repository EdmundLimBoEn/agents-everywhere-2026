# agents-everywhere-2026

Hackathon monorepo for an adaptive teaching agent that lives in Google Classroom.

Students select real Classroom posts through a browser extension. A same-tab overlay shows their documents beside an adaptive lesson, with passage citations, voice, and a shared whiteboard. See [Why this belongs in Classroom](docs/theme-fit.md) and the [PRD](docs/prd.md).

Run it with the [build and setup guide](docs/build-and-run.md). Google OAuth and OpenAI model credentials are required for live teaching. Browser tests use mocked integrations; no fake class content is shipped.

## Layout

| Path | Role |
| --- | --- |
| `notes/` | Raw PDF dump. Every file links to a Classroom item. |
| `docs/` | PRD, Classroom spec, architecture, and the ChatGPT source plans. |
| `app/` | Implemented Chrome extension, study UI, Bun API, SQLite storage, and shared contracts. |

## Do not

Do not commit unless asked. Do not invent sample PDFs. Do not treat Classroom as an optional plugin.
