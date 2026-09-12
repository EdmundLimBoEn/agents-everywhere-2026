# agents-everywhere-2026

Hackathon monorepo for an adaptive teaching agent that lives in Google Classroom.

Students open an assignment they already have. The agent teaches there with voice, a shared whiteboard, and RAG over school notes linked to that coursework. See [Why this belongs in Classroom](docs/theme-fit.md) and the [PRD](docs/prd.md).

## Layout

| Path | Role |
| --- | --- |
| `notes/` | Raw PDF dump. Every file links to a Classroom item. |
| `docs/` | PRD, Classroom spec, architecture, and the ChatGPT source plans. |
| `app/` | Web add-on, iOS companion, services, and shared contracts. |

## Do not

Do not commit unless asked. Do not invent sample PDFs. Do not treat Classroom as an optional plugin.
