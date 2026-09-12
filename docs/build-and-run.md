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

The generated `app/dist/extension/manifest.json` is the exact scope reference. The build requests `openid`, `email`, `profile`, and these read-only Google scopes:

```text
https://www.googleapis.com/auth/classroom.courses.readonly
https://www.googleapis.com/auth/classroom.coursework.me.readonly
https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly
https://www.googleapis.com/auth/classroom.announcements.readonly
https://www.googleapis.com/auth/classroom.topics.readonly
https://www.googleapis.com/auth/documents.readonly
https://www.googleapis.com/auth/drive.readonly
```

There is no grade passback or Classroom write access. Google authorization remains in the extension worker; the Classroom page does not receive the token. The worker sends it to your configured backend for Google access verification and document retrieval. OpenAI credentials stay on the backend. Retrieved lesson content and student responses are sent to OpenAI to teach; voice additionally connects the browser to OpenAI using a short-lived session credential.

## Use the complete flow

The extension now opens **Catch Up**, a visual dashboard based on the selected class. Choose **Updates since** and **Time you have**, then **Build my plan**. With no checkboxes selected, the crew uses all visible updates; otherwise it uses only selected updates that still match the filters. Select at most 30 posts. Posts with unavailable publication dates remain visible and are labeled; deadlines are displayed only when Classroom supplies them. The date filter is an update filter, not an attendance or submission tracker.

The plan shows estimated time for each step, unused time, source links, and the planner's reason for the order. **Start** opens the relevant source beside the existing tutor. **Explain the concept** and **Give me a hint** submit questions through the same grounded teaching engine. **Your catch-up plan** returns to the dashboard, and **Saved lessons** resumes persisted work. Plans cover one selected class at a time; choose another class from the sidebar to switch.

Step checkmarks are self-reported and stored on the current browser/device; they do not record mastery or submit Classroom assignments. Checkmarks survive reopening the same plan, but changed steps start unchecked. If browser storage is unavailable, the checklist works only for the current visit. The server still owns lessons and assessment evidence. A failed plan-generation request retries the same lesson and request ID instead of creating duplicate lessons.

Deleting a lesson clears its local checklist and displayed plan. The **Delete all my learning data** confirmation also explicitly clears all Catch Up checkmarks on this device, including those left by earlier account sessions.

For a visible local preview, open `http://localhost:8787` while the server runs. It shows the connection screen until Google is authorized through the extension. The responsive dashboard is included in `app/dist/extension`; reload the unpacked extension after rebuilding. The standalone page does not bypass Google authentication, and no public deployment is created by the local build.

On Stream or Classwork, select posts using the injected controls, study a topic, or find notes related to an assignment. The material picker also lists posts from the actual Classroom API. Select two posts with readable attachments, open the lesson, and choose **Teach me**. Documents stay visible beside the teaching conversation. Click a citation to open and highlight its passage. Answer incorrectly to exercise reteaching, then use an interruption such as simplify, example, why, or skip. Continue through practice, teach-back, and recap.

The board supports diagram items and drawing. Learner settings and assessment evidence persist with the lesson. Close the overlay with its close button or Escape to return to Classroom, then reopen and resume the saved lesson. For voice, start a lesson first, enable voice, and allow microphone access. Voice requires a configured Realtime model and a working WebRTC connection; spoken student turns use the same teaching engine as typed turns.

The standalone page at `http://localhost:8787` shows the study UI but does not replace extension Google sign-in. The product does not seed fake Classroom posts or sample notes when Google is unavailable.

## Due-soon badge

After connecting, the worker checks each active class once an hour. The toolbar badge shows how many assignments are due within 48 hours, and Chrome shows one notification per new deadline naming the class, the due time and the number of attached notes. Clicking it opens that assignment in Classroom. The badge uses the same read-only Classroom scopes and the same backend routes as the study window; it requests the `alarms` and `notifications` extension permissions. Submission state is not read, so a turned-in assignment still counts until its deadline passes. Disconnecting Google clears the badge.

## Data and recovery

Lesson documents, conversations, board state, learner preferences, assessment evidence, and idempotent turn snapshots are stored locally in SQLite. The server rechecks Google access and refreshes materials when resuming and teaching. Deleting a lesson removes its turn history and associated profile evidence. Forgetting an evidence item removes it from the profile, lessons, and cached turn snapshots. Deleting the profile deletes all that user's saved lessons and profile. These actions do not delete Google Classroom files. Disconnect Google in extension settings to remove the extension's cached authorization; disconnecting does not delete stored study data. SQLite deletion is logical deletion, not a guarantee of forensic erasure from backups or disk.

Missing Google setup prevents protected API access with a setup error. Missing teaching credentials lets materials load but prevents teaching. Missing voice configuration disables live voice. A denied document is reported individually; an expired authorization requires reconnecting. No readable sources means teaching cannot start. A stale lesson revision or concurrent turn returns HTTP 409: reload the lesson before a new turn, and preserve the same request ID and payload when retrying a failed submission.

## Limits and verification

Select 1–30 posts and at most 40 unique attachments. Files are limited to 15 MiB; PDFs to 150 pages. Extracted text is limited to 250,000 characters per document and 600,000 per lesson. Google Docs and text-based PDFs are readable; scanned PDFs need text extraction outside this implementation. Unsupported or inaccessible attachments are reported, not fabricated. Assignment relevance uses topic and title/description overlap. Classroom DOM changes may affect injected controls; the API-backed material picker remains available.

```sh
cd app
bun run check
bunx playwright install chromium
bun run test:e2e
```

`check` runs TypeScript checks, service tests, and builds the UI and extension. Browser tests exercise the UI and extension integration with mocked services; they do not prove live school OAuth, real Google documents, OpenAI model availability, microphone hardware, or school network WebRTC connectivity. Verify those with an authorized account using the flow above before a live demo. Current source tests and their results, rather than this guide, are the authority for what passed on a particular machine.

The HTTP contract is [OpenAPI](../app/packages/openapi/openapi.json). It describes bearer-authenticated routes and public status; it is not a deployment. The server has a local SQLite store and process-local concurrency/rate limits; horizontal deployment and production operations need a separate design.

The extension negotiates an NDJSON response for long requests. Heartbeats keep the connection responsive while Google or the tutor runs; the final frame includes the underlying HTTP status and JSON body. Ordinary HTTP clients retain the OpenAPI response shape. The worker keepalive is bounded to the active request and clears on success or failure. See [Chrome’s worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) for its network time limits.

## Verified build — 12 September 2026

- `bun run check`: TypeScript clean, 45 service/boundary tests passing, web and extension bundles built.
- `bun run test:e2e`: 6 Chromium tests passing, including loading the actual unpacked MV3 extension, source navigation, close/resume behavior, and failed/pending whiteboard saves.
- Visual inspection: source reader, highlighted passage, composer, and voice controls remain visible at the tested desktop viewport.
- Live school OAuth, Classroom DOM matching against a signed-in class, provider-generated teaching, and microphone/WebRTC audio remain unverified without the required accounts and credentials. Test lesson content exists only in explicitly labeled test fixtures.

## Four-agent catch-up crew

Select the Classroom posts you want to catch up on, open the lesson, enter a 5–120 minute study window, and choose **Help me catch up**. The Class Scout reads selected material, the Planner proposes cited steps within your time budget, and the Tutor starts a diagnostic. After an answer, a separate Reviewer assesses it and identifies supported prerequisite gaps. The Planner receives that review before replanning; the Tutor receives the updated plan and must agree with the review before the turn can be saved. Expand **Your catch-up crew** to inspect each contribution and open its source citations.

Each role is a separate structured OpenAI request, using the existing configured model. Initial turns use three requests; assessable answers use four. Questions and interruptions do not invoke the Reviewer or earn assessment evidence. The crew has a three-minute provider deadline; failures preserve the previous lesson and the existing retry flow. The original **Teach me this topic** path still uses one tutor request.

Plans describe the next study window, with estimated durations; they are not timers or completion records. Only the selected posts are in scope. The crew does not infer attendance, submission status, or everything a student missed. Available assignment deadlines are passed through using [Google's UTC date/time contract](https://developers.google.com/workspace/classroom/reference/rest/v1/courses.courseWork). Missing deadlines and inaccessible materials stay unknown. No new Google scopes or write permissions are needed.

Crew results persist atomically with the lesson in SQLite and survive resuming. Forgetting an assessment also clears that lesson's derived crew notes. The HTTP contract adds optional `catchUpMinutes` on a turn and optional `catchUp` and `classroomPosts` on a lesson. Existing lessons remain compatible. Subsequent typed and voice-submitted turns inherit catch-up mode from the saved lesson.

The standard checks include deterministic handoff, budget, citation, disagreement, persistence, and browser tests. To explicitly run the live provider test with synthetic test material (uses the configured API account):

```sh
cd app
RUN_LIVE_CREW=1 bun test services/agent/src/crew.live.test.ts
```

This provider test does not access a student's Google account and does not verify school OAuth or microphone hardware.

Catch-up verification on 12 September 2026: 52 deterministic service/boundary tests and 10 Chromium browser tests passed. The opt-in live model test also passed, exercising initial planning and replanning after an incorrect answer. TypeScript and extension/web builds passed. Browser coverage includes dashboard planning, date filters, idempotent retries, local checkmarks and deletion, mobile layout, unavailable-service recovery, source navigation, the chosen time budget, and visible voice controls with the crew expanded. School-account OAuth remains an independent live integration check.
