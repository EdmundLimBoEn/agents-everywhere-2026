# Locked decisions

The current [PRD](./prd.md) and [hackathon scope](./hackathon-scope.md) supersede earlier integration choices. Teaching behavior from the ChatGPT discussion still holds.

## Product lock after the share

The primary surface is a browser extension overlay on the real Google Classroom page, with multi-post selection, readable source tabs, and adaptive teaching. Teacher-installed add-on discovery and grade passback are deferred. Lessons can span several posts; they are not restricted to one assignment. See [Why this belongs in Classroom](./theme-fit.md). Google OAuth is required. A custom teacher dashboard stays out. Teachers work in Classroom.

## Grilling locks that still hold

- Adaptive teacher, not a Q&A bot.
- Agent chooses the next teaching action by default. Structured "teach this chapter" is a mode.
- Shared whiteboard. Student and agent both act.
- Ground in school notes. Allow labeled external depth when the student asks.
- Test understanding with conversation plus real practice papers.
- Mastery is evidence-rich, not one score. Track misconceptions as first-class data.
- Lightweight rolling plan plus a full autonomous lesson mode.
- Onboarding is a questionnaire. Students do not upload PDFs. The team dumps files into `notes/`.
- Multi-subject content, one polished demo topic first.
- Cite school sources in the student UI. Developer mode shows retrieval internals.
- Home in our web app is a companion. Classroom course list is the real home.
- Match practice questions to weak topics and difficulty.
- Adapt difficulty. Show mastery bars and an optional knowledge map.
- Voice is a control surface, not speech-to-text only.
- Student-only custom UI. Inspectable and editable learner model.
- Learning mode and exam mode.
- Collaborative study for 2 to 4 students is nice to have.
- Generated questions imitate school papers and are labeled.
- Use mark schemes when present.
- TypeScript first. Next.js on Cloudflare Workers. Native SwiftUI. PencilKit on iOS. No Live Activities.
- OpenAPI source of truth. One monorepo.
- Cloud-first, free-tier-first. Do not force D1.
- GPT Live from the client with short-lived credentials. Tools validated on the server.
- Explicit lesson state machine.
- Hybrid RAG plus graph plus RAGAS and a golden set.
- Ask Edmund before choosing OpenAI models.

## Auth change

The chat allowed Google, Apple, or email. Classroom requires Google. Ship Google only for the hackathon.
