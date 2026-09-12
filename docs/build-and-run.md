# Build and run Afterclass

Afterclass is a Chrome Manifest V3 extension with a same-tab Classroom overlay, a vanilla TypeScript study UI, and a Bun HTTP server using SQLite. The runtime is local.

## Local setup

Install Bun and Chrome. From the repository root:

```sh
cd app
bun install
cp .env.example .env
```

Edit `.env` before building. Never commit API keys or tokens.

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Google Chrome extension OAuth client ID. The server accepts a comma-separated allowlist; the extension uses its first entry. |
| `OPENAI_API_KEY` | Server-only OpenAI key for teaching and optional voice. |
| `OPENAI_MODEL` | Explicit model ID with structured-output support and access on your account. Authorized pilot choice: `gpt-5.4-mini`. |
| `OPENAI_REALTIME_MODEL` | Explicit Realtime model ID for optional voice. Authorized pilot choice: `gpt-realtime-2.1-mini`. |
| `API_ORIGIN` | Extension backend origin; defaults to `http://localhost:8787`. Rebuild after changing. HTTPS required except loopback HTTP. |
| `PORT` / `HOST` | Server defaults: `8787` / `127.0.0.1`. Keep `API_ORIGIN` consistent. |
| `EXTENSION_ID` | Extension origin allowed by the API. Bundled public key yields `pdilhkaadeldjlpcnpebmhfchkoankec`; set explicitly if using another key. |
| `ALLOWED_ORIGINS` | Optional additional exact origins, comma-separated. |
| `ALLOWED_GOOGLE_USERS` | Optional comma-separated pilot email allowlist; empty permits authenticated users of the configured OAuth client. |
| `DATABASE_PATH` | Defaults to `app/data/study.sqlite`; choose durable local storage. |

### Google configuration

1. In a Google Cloud project, enable Google Classroom API, Google Docs API, and Google Drive API.
2. Configure the OAuth consent screen and requested scopes. While in testing, add the student accounts as test users. A school administrator may need to allow this OAuth application and its requested scopes.
3. Create a Chrome extension OAuth client for extension ID `pdilhkaadeldjlpcnpebmhfchkoankec`. The bundled public key is intentionally public and fixes the unpacked extension ID; it is not a credential.
4. Set `GOOGLE_CLIENT_ID` in `.env`, then build:

```sh
bun run build
bun run start
```

5. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `app/dist/extension` from the repository. Confirm its ID matches the OAuth client. After rebuilding, reload the extension and Classroom tab.
6. Open a real class at Google Classroom, click **Study notes**, and connect Google. The signed-in account must actually have access to that class and its attachments.

The generated `app/dist/extension/manifest.json` is the exact scope reference. The build requests `openid`, `email`, `profile`, and these Google scopes:

```text
https://www.googleapis.com/auth/classroom.courses.readonly
https://www.googleapis.com/auth/classroom.coursework.me.readonly
https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly
https://www.googleapis.com/auth/classroom.announcements.readonly
https://www.googleapis.com/auth/classroom.topics.readonly
https://www.googleapis.com/auth/documents
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/classroom.coursework.students
https://www.googleapis.com/auth/drive.readonly
```

The Docs & assignments editor can write documents and assignments after user review; it does not pass back grades or submit student work. Google authorization remains in the extension worker; the Classroom page does not receive the token. The worker sends it to your configured backend for Google access verification and document retrieval. OpenAI credentials stay on the backend. Retrieved lesson content and student responses are sent to OpenAI to teach; voice additionally connects the browser to OpenAI using a short-lived session credential.

If assignments show `courseWork: Google denied access to this resource`, check the account connected to the extension, which may differ from the account open in the Classroom tab. This build requests `classroom.coursework.me.readonly` for students; the authoring build also requests `classroom.coursework.students` for teacher access in classes they teach ([Google scope reference](https://developers.google.com/workspace/classroom/guides/auth)). For student testing, use an account enrolled as a student in the selected class. Missing OAuth consent is reported separately: disconnect Google in extension settings, reconnect from the study window, and approve the requested permissions. Reload the extension after any rebuild that changes scopes. Disabled APIs and school policy restrictions require the indicated Cloud project or administrator change; repeated sign-in alone cannot resolve them.

## Use the complete flow

The extension now opens **Catch Up**, a visual dashboard based on the selected class. Choose **Updates since** and **Time you have**, then **Build my plan**. With no checkboxes selected, the crew uses all visible updates; otherwise it uses only selected updates that still match the filters. Select at most 30 posts. Posts with unavailable publication dates remain visible and are labeled; deadlines are displayed only when Classroom supplies them. The date filter is an update filter, not an attendance or submission tracker.

The plan shows estimated time for each step, unused time, source links, and the planner's reason for the order. **Start** opens the relevant source beside the existing tutor. **Explain the concept** and **Give me a hint** submit questions through the same grounded teaching engine. **Your catch-up plan** returns to the dashboard, and **Saved lessons** resumes persisted work. Plans cover one selected class at a time; choose another class from the sidebar to switch.

Step checkmarks are self-reported and stored on the current browser/device; they do not record mastery or submit Classroom assignments. Checkmarks survive reopening the same plan, but changed steps start unchecked. If browser storage is unavailable, the checklist works only for the current visit. The server still owns lessons and assessment evidence. A failed plan-generation request retries the same lesson and request ID instead of creating duplicate lessons.

Deleting a lesson clears its local checklist and displayed plan. The **Delete all my learning data** confirmation also explicitly clears all Catch Up checkmarks on this device, including those left by earlier account sessions.

For a visible local preview, open `http://localhost:8787` while the server runs. It shows the connection screen until Google is authorized through the extension. The responsive dashboard is included in `app/dist/extension`; reload the unpacked extension after rebuilding. The standalone page does not bypass Google authentication, and no public deployment is created by the local build.

On Stream or Classwork, select posts using the injected controls, study a topic, or find notes related to an assignment. The material picker also lists posts from the actual Classroom API. Select two posts with readable attachments, open the lesson, and choose **Teach me**. Documents stay visible beside the teaching conversation. Click a citation to open and highlight its passage. Answer incorrectly to exercise reteaching, then use an interruption such as simplify, example, why, or skip. Continue through practice, teach-back, and recap.

The Excalidraw board supports editable diagrams, freehand drawing, text, images, undo/redo, and scene import/export. Scenes save with the lesson; failed saves retain edits and expose a Save retry button. Draw something, type a question in **Ask about what you drew…** and press **Ask the tutor**; the tutor receives a picture of the board plus a list of your shapes, answers from the notes, and marks its answer in green next to the shapes it discusses. Its marks are ordinary Excalidraw shapes you can move or delete, and the next annotated answer replaces them. **Teach me at the whiteboard** runs the lesson on the board instead: the tutor draws its diagram part by part as it explains, keeps what it drew on earlier turns, and adds to it after each answer. Learner settings and assessment evidence persist with the lesson. Close the overlay with its close button or Escape to return to Classroom, then reopen and resume the saved lesson. For voice, start a lesson first, enable voice, and allow microphone access. Voice requires a configured Realtime model and a working WebRTC connection; spoken student turns use the same teaching engine as typed turns.

The standalone page at `http://localhost:8787` shows the study UI but does not replace extension Google sign-in. The product does not seed fake Classroom posts or sample notes when Google is unavailable.

## Work on the assignment in front of you

Choose **Work on this assignment** on a Classroom assignment or its card in the Catch Up dashboard. The workspace opens the assignment with relevant class materials. It prepares a source-linked goal and requirements, suggests a next action, and keeps the source reader beside the student's work. Other selected assignments are not merged into this assignment's requirements.

1. Inspect the requirements and open their citations to see the teacher's instructions or rubric. Open suggested notes to read the material behind the guidance.
2. Write your own response in the draft editor and save it. The draft belongs to this saved lesson and resumes with it; saving does not call OpenAI or edit a Google document.
3. Describe where you are stuck and request help, or leave the question blank for a contextual next hint. The response uses the selected class sources to suggest a hint and a next step.
4. Request a review of the draft. Each requirement receives a coverage status and feedback. Draft evidence is quoted from your actual response, while source citations point to the teacher's material. Coverage feedback is not a predicted grade. Saving a changed draft clears the previous review and hint so old feedback is not presented as feedback on new work; saving unchanged text retains them.
5. Use **Find in my draft** to select the quoted evidence, or **Work on this gap** to focus the editor with the feedback beside your work. The progress bar shows requirements addressed in the last review; edited drafts still need a fresh review.
6. Save with **Save draft** or **⌘S / Ctrl+S** while writing. Word and character counts update as you type. Choose **Copy my draft**, then return to the original assignment in Classroom to paste and submit it yourself. If clipboard access is blocked, the editor selects your draft for manual copying. Afterclass does not upload drafts, mark assignments complete, or submit on your behalf.

The server reads an accessible native Classroom rubric using the existing `classroom.coursework.me.readonly` scope; no new scopes are requested. If a rubric is missing or denied, the workspace uses only supported assignment instructions and reports the limitation instead of inventing teacher criteria. An expired Google authorization requires reconnecting. Materials must be accessible to the signed-in student; production never substitutes synthetic notes or assignments.

If the teacher changes assignment instructions or rubric content, Afterclass preserves your draft and clears derived feedback. Choose **Refresh requirements** before requesting another hint or review. Saving your draft remains available while requirements are stale.

The workspace uses `POST /api/lessons/{lessonId}/assignment`, returning the updated `Lesson` with optional `assignment` state. Every action includes `revision` and `requestId`. `prepare` requires an `assignmentId` identifying a selected `courseWork` post; `save` requires `draft`. Drafts are limited to 20,000 characters and blocker questions to 2,000. Preparation, help, and review use the configured teaching model; draft saves are provider-free. Retry an uncertain request with its unchanged payload and request ID; a stale revision requires reloading before making a new change. Preserve unsaved text before reloading.

## Data and recovery

Lesson documents, conversations, board state, assignment requirements, saved drafts and reviews, learner preferences, assessment evidence, and idempotent request snapshots are stored locally in SQLite. The server rechecks Google access and refreshes materials when resuming and teaching. Deleting a lesson removes its turn history and associated profile evidence. Forgetting an evidence item removes it from the profile, lessons, and cached turn snapshots. Deleting the profile deletes all that user's saved lessons and profile. These actions do not delete Google Classroom files. Disconnect Google in extension settings to remove the extension's cached authorization; disconnecting does not delete stored study data. SQLite deletion is logical deletion, not a guarantee of forensic erasure from backups or disk.

Missing Google setup prevents protected API access with a setup error. Missing teaching credentials lets materials load but prevents teaching. Missing voice configuration disables live voice. A denied document is reported individually; an expired authorization requires reconnecting. No readable sources means teaching cannot start. A stale lesson revision or concurrent turn returns HTTP 409: reload the lesson before a new turn, and preserve the same request ID and payload when retrying a failed submission.

## Limits and verification

Select 1–30 posts and at most 40 unique attachments. Files are limited to 15 MiB; PDFs to 150 pages. Extracted text is limited to 250,000 characters per document and 600,000 per lesson. See Mixed documents and authoring below for supported formats, scanned PDFs and visual reading. Unsupported or inaccessible attachments are reported, not fabricated. Assignment relevance uses topic and title/description overlap. Classroom DOM changes may affect injected controls; the API-backed material picker remains available.

```sh
cd app
bun run check
bunx playwright install chromium
bun run test:e2e
```

If another preview is already using port 8787, run `PORT=8791 bun run test:e2e` to use a separate test server. Playwright uses `PORT` for both its server and browser base URL.

`check` runs TypeScript checks, service tests, and builds the UI and extension. Browser tests exercise the UI and extension integration with mocked services; they do not prove live school OAuth, real Google documents, OpenAI model availability, microphone hardware, or school network WebRTC connectivity. Verify those with an authorized account using the flow above before a live demo. Current source tests and their results, rather than this guide, are the authority for what passed on a particular machine.

The HTTP contract is [OpenAPI](../app/packages/openapi/openapi.json). It describes bearer-authenticated routes and public status; it is not a deployment. The server has a local SQLite store and process-local concurrency/rate limits; horizontal deployment and production operations need a separate design.

The extension negotiates an NDJSON response for long requests. Heartbeats keep the connection responsive while Google or the tutor runs; the final frame includes the underlying HTTP status and JSON body. Ordinary HTTP clients retain the OpenAPI response shape. The worker keepalive is bounded to the active request and clears on success or failure. See [Chrome’s worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) for its network time limits.

## Verified build — 12 September 2026

- `bun run check`: TypeScript clean, 82 service/boundary tests passing (3 live-provider tests skip without credentials), web and extension bundles built.
- `bun run test:e2e`: 20 Chromium tests passing, including loading the actual unpacked MV3 extension, source navigation, close/resume behavior, failed/pending whiteboard saves, tutor marks drawn beside a student's whiteboard shape, and a lesson taught at the whiteboard whose diagram grows across turns.
- Visual inspection: source reader, highlighted passage, composer, and voice controls remain visible at the tested desktop viewport.
- Live school OAuth, Classroom DOM matching against a signed-in class, provider-generated teaching, and microphone/WebRTC audio remain unverified without the required accounts and credentials. Test lesson content exists only in explicitly labeled test fixtures.

## Four-agent catch-up crew

Select the Classroom posts you want to catch up on, open the lesson, enter a 5–120 minute study window, and choose **Help me catch up**. The Class Scout reads selected material, the Planner proposes cited steps within your time budget, and the Tutor starts a diagnostic. After an answer, a separate Reviewer assesses it and identifies supported prerequisite gaps. The Planner receives that review before replanning; the Tutor receives the updated plan and must agree with the review before the turn can be saved. Expand **Your catch-up crew** to inspect each contribution and open its source citations.

Each role is a separate structured OpenAI request, using the existing configured model. Initial turns use three requests; assessable answers use four. Questions and interruptions do not invoke the Reviewer or earn assessment evidence. The crew has a three-minute provider deadline; failures preserve the previous lesson and the existing retry flow. The original **Teach me this topic** path still uses one tutor request.

Plans describe the next study window, with estimated durations; they are not timers or completion records. Only the selected posts are in scope. The crew does not infer attendance, submission status, or everything a student missed. Available assignment deadlines are passed through using [Google's UTC date/time contract](https://developers.google.com/workspace/classroom/reference/rest/v1/courses.courseWork). Missing deadlines and inaccessible materials stay unknown. The catch-up crew itself requires only read scopes; optional authoring uses the write scopes described below.

Crew results persist atomically with the lesson in SQLite and survive resuming. Forgetting an assessment also clears that lesson's derived crew notes. The HTTP contract adds optional `catchUpMinutes` on a turn and optional `catchUp` and `classroomPosts` on a lesson. Existing lessons remain compatible. Subsequent typed and voice-submitted turns inherit catch-up mode from the saved lesson.

The standard checks include deterministic handoff, budget, citation, disagreement, persistence, and browser tests. To explicitly run the live provider test with synthetic test material (uses the configured API account):

```sh
cd app
RUN_LIVE_CREW=1 bun test services/agent/src/crew.live.test.ts
```

This provider test does not access a student's Google account and does not verify school OAuth or microphone hardware.

Catch-up verification on 12 September 2026: 52 deterministic service/boundary tests and 10 Chromium browser tests passed. The opt-in live model test also passed, exercising initial planning and replanning after an incorrect answer. TypeScript and extension/web builds passed. Browser coverage includes dashboard planning, date filters, idempotent retries, local checkmarks and deletion, mobile layout, unavailable-service recovery, source navigation, the chosen time budget, and visible voice controls with the crew expanded. School-account OAuth remains an independent live integration check.

## Mixed documents and authoring

Selected assignment descriptions, material text, and announcement bodies now become their own citable sources, even with no attachments. They remain available if an attachment fails. Known Docs/Sheets/Slides/Drive links in post text or link attachments are resolved by ID; arbitrary URLs are never fetched with Google credentials.

Supported inputs: Google Docs (all tabs and tables), Sheets, Slides and Drawings exported as PDF; PDF text plus visual reading; Word DOC/DOCX, Excel XLS/XLSX, PowerPoint PPT/PPTX, ODT/RTF, TXT/Markdown/CSV/TSV, and PNG/JPEG/WebP. The server uses the configured vision-capable `OPENAI_MODEL` and key to read file inputs. Without it, post text, Docs text, CSV/text files and PDF text layers still work; Office/image reads report a configuration failure. Office file inputs expose text, not embedded pictures; export those files as PDF when diagrams matter. Excel input is limited by the provider to the first 1,000 rows per sheet. Sheets PDF exports follow Google print/export layout. Unsupported formats, inaccessible files, model refusal and truncation are reported rather than treated as complete readings. Audio/video transcription is not included.

AI extraction is labeled in the source reader. Citations from those passages verify against the extracted interpretation, not the original pixels; review the original for precise wording. Text extraction and model reading retain the 15 MiB file, 150-page PDF and lesson text limits. Up to 20 file readings are cached in memory by content hash, after fresh Google access checks and download; original credentials and bytes are not cached. Model and Google calls still have timeouts, so select fewer large attachments if a lesson exceeds the extension request deadline.

Open **Docs & assignments** in the browser study window. Ask for a draft (optionally grounded in the current lesson), review/edit its title and text, then choose **Create Google Doc**. The document is automatically selected for the new assignment’s attachments. Drive search can add existing files. Choose view/edit/per-student-copy access, points, UTC deadline and draft/published state, then save. New assignments default to DRAFT. Selecting an existing assignment loads its fields; later saves update that assignment. Google restricts API edits to assignments created by the same Google Cloud project, and does not support patching assignment attachments. Use native Classroom for those changes.

Load a Doc to read its current passages, rename it, append to its first tab with revision protection, move it to trash or restore it. The editor appends rather than replacing rich content. Reload before another append. If a write times out, inspect Drive/Classroom before repeating it: Google create operations do not expose an idempotency key, so an uncertain request may already have succeeded. The editor never automatically retries Google writes.

Enable the Drive and Docs APIs plus Classroom API. Rebuild/reload the extension and reconnect Google to consent to `documents`, `drive.file` and `classroom.coursework.students` in addition to the existing read scopes. `drive.file` permits managing files created/opened with this app; it does not grant unrestricted modification of all Drive files. Google teacher permissions and school policy continue to apply. Classroom content scripts can only read course listings; authoring requests originate in the extension's own UI. Draft generation has no authority to execute Google writes.

References: [OpenAI file inputs](https://developers.openai.com/api/docs/guides/file-inputs), [Google export formats](https://developers.google.com/workspace/drive/api/guides/ref-export-formats), [Classroom create](https://developers.google.com/workspace/classroom/reference/rest/v1/courses.courseWork/create), [Classroom patch fields](https://developers.google.com/workspace/classroom/reference/rest/v1/courses.courseWork/patch).

For isolated browser verification while another checkout serves port 8787, run `E2E_PORT=8791 bun run test:e2e`. Browser service mocks validate interactions and payloads; they do not establish live OAuth write access.
## Assignment verification

On 12 September 2026, `bun run check` passed TypeScript, 65 service/boundary tests, and the web/extension build. `PORT=8793 CI=1 bun run test:e2e` passed all 14 Chromium tests, including direct assignment launch, cited help, saved/resumed drafts, identical-request retry, stale-revision recovery, changed requirements, and desktop/mobile layouts. Browser classroom data is synthetic. The live OpenAI prepare → hint → save → review test passed with synthetic materials; school-account OAuth and live Classroom rubric access remain unverified.

```sh
cd app
RUN_LIVE_ASSIGNMENT=1 bun test services/agent/src/assignment.live.test.ts
```

This opt-in test uses the configured OpenAI account. Citation validation rejects altered quotes rather than displaying unsupported evidence; a rejected model response can be retried without losing the draft.

## Integrated worktree verification

The integrated build combines Excalidraw scene persistence, document and
assignment authoring, mixed-file reading, and the student assignment workspace.
Assignment instructions and rubrics use their dedicated citation IDs; other
Classroom post text remains available as sources without duplicating assignments.
The authoring and student-workspace request validators remain separate.

Run `bun run check` and `E2E_PORT=8798 CI=1 bun run test:e2e` from `app/`.
Live provider tests are opt-in; local browser checks use synthetic Classroom data.
