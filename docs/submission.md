# Submission pack

Everything needed for the 15:00–15:30 portal window, written against the challenge text ("build a working agent that belongs somewhere new; its context should make it meaningfully more useful than a separate chat window; a sharp working demo over a broad concept"). Pair with [hackathon-event.md](./hackathon-event.md) for the schedule and checklist, and [hackathon-scope.md](./hackathon-scope.md) for the demo script.

## Fit against the brief

| Brief asks | Afterclass answer |
| --- | --- |
| Belongs somewhere new | It runs inside the Google Classroom page. Controls sit beside real posts; the lesson opens as a same-tab overlay; closing it returns the student to the same scroll position and focus. |
| Context makes it more useful than a chat window | The class, the posts, the attached Docs and PDFs, the topic grouping, the due dates, and the assignment instructions and rubric are already there. The tutor reads them through the student's own Google authorization. A chat window would need the student to upload files and retype the assignment. |
| Working agent | A server-enforced lesson state machine (diagnostic → teach → check → reteach or practice → teach-back → recap). Every claim cites an exact substring of a retrieved passage or the turn is rejected. Catch Up runs a scout, planner, tutor, and reviewer that must agree before a turn is saved. |
| Sharp demo | One topic, two real posts, two real PDFs, one deliberately wrong answer that visibly changes the next teaching action and reorders the plan. |

Contexts covered from the event page: **Work** (documents, live collaboration inside a school tool) and **Web** (a browser extension acting on a real site). Say this plainly; do not claim the other two.

## Portal text

### Project title

Afterclass

### Tagline

An adaptive AI teacher that lives inside Google Classroom.

### Description (what, who, why the context matters)

**What we built.** Afterclass is a Chrome extension that puts a tutor inside the Google Classroom page students already use. A student ticks the posts they want help with and clicks *Study these together*. The attached Docs and PDFs open as readable tabs beside a lesson in the same browser tab. The tutor starts with a diagnostic question, teaches one idea from the teacher's own notes, checks understanding, and changes what it does next based on the answer. Every explanation cites a passage the student can click to open and highlight. When a student is behind, *Catch Up* takes the selected posts and the minutes they have and produces a short, cited plan; a separate reviewer grades each answer and the plan reorders around the gap. On an assignment, *Work on this assignment* turns the teacher's instructions and rubric into cited requirements, gives hints from the class materials, and reviews the student's own draft against those requirements. The student copies the draft back into Classroom and submits it themselves.

**Who it serves.** Students whose teachers already post notes and assignments in Google Classroom, and who study after class without a teacher in the room. Teachers change nothing about how they work.

**Why the context matters.** The agent is only as good as what it can see, and inside Classroom it sees the right things without being told: which class, which posts, which files, which topic, which deadline, which rubric. That lets us enforce grounding instead of hoping for it. The server rejects any tutor reply whose citation is not an exact quote from a retrieved passage, any reply that skips a lesson step, and any Catch Up turn where the tutor and reviewer disagree. Those checks are only possible because the source set is the teacher's actual documents, retrieved with the student's own read-only Google access. Nothing is written back to Classroom, no grades, no submissions.

**How it is built.** Chrome Manifest V3 extension (content script plus service worker holding the Google token); Bun API with SQLite; Classroom, Drive, and Docs APIs for retrieval; OpenAI Responses API with strict JSON schemas for the tutor and the four-role catch-up crew; Excalidraw whiteboard; optional Realtime voice.

### Built with

Chrome Extensions (MV3), TypeScript, Bun, SQLite, Google Classroom API, Google Drive API, Google Docs API, OpenAI Responses API (structured outputs), OpenAI Realtime API (optional voice), Excalidraw, pdf.js, Playwright.

### Repository

https://github.com/EdmundLimBoEn/agents-everywhere-2026 (public). Setup: [build-and-run.md](./build-and-run.md).

## Two-minute video shot list

Record on the real demo class with the two electricity notes posted under one topic. Narration lines are suggestions; keep the cursor slow.

| Time | Shot | Say |
| --- | --- | --- |
| 0:00–0:10 | Cover card (`assets/devpost/afterclass-cover.png`) | "This is Afterclass, an adaptive AI teacher inside Google Classroom. Start with your teacher's materials. Work through one idea. When your answer shows a gap, the lesson changes its next step." |
| 0:10–0:25 | Real class. Stream, then Classwork. Injected checkboxes and buttons visible beside posts. | "Teachers change nothing. Students see their normal class, plus a way to study any post." |
| 0:25–0:40 | Tick both electricity posts. Click *Study these together*. Overlay opens in the same tab; two document tabs load. | "Two real posts, two real PDFs, fetched with the student's own Google access." |
| 0:40–0:55 | Enter 15 minutes. *Build my plan*. Steps with minute estimates and source links appear. Click *Start* on step one. | "A scout, a planner, a tutor, and a reviewer produce a plan that fits the time and cites the notes." |
| 0:55–1:10 | Ask the cross-document question (current in a circuit and the fuse rating). Click a citation; the PDF scrolls and highlights. | "Every answer cites a passage you can open." |
| 1:10–1:35 | *Teach me*. Diagnostic appears. Type "Yes, the lamps use up the current." Reteach names the misconception, highlights the passage, plan reorders. | "Answer wrong on purpose. The tutor names the misconception, reteaches from the notes, and the plan puts that gap first." |
| 1:35–1:50 | Explain the idea back. Recap shows demonstrated understanding and notes to revisit. | "The recap separates what you showed from what still needs practice." |
| 1:50–2:00 | Close the overlay. Same Classroom page, same scroll. Reopen, lesson resumes. End card with repo URL. | "Close it and you are exactly where you were. Afterclass." |

Cut anything that runs long from 0:40–0:55 first; the wrong-answer beat at 1:10 is the one judges must see.

## Social post draft

Sponsor handles were not in the pasted event page. Fill the placeholders before posting.

> We built Afterclass at Agents, Everywhere (Singapore): an AI teacher that lives inside Google Classroom. Tick two posts, get tutored from those exact PDFs, every explanation cited, and the lesson changes when your answer shows a gap. Nothing written back to Classroom. Repo: https://github.com/EdmundLimBoEn/agents-everywhere-2026 #AgentsEverywhere @[AI Tinkerers SG] @[OpenAI] @[sponsor handles]

## Three-minute pitch (if shortlisted)

1. **The place** (20 s). Students already have the notes, the assignment, and the deadline in Classroom. The tutor goes there instead of asking them to come to it.
2. **The demo** (100 s). Steps 0:25 to 1:50 of the video, live. Wrong answer on purpose.
3. **Why it holds up** (40 s). Exact-quote citations enforced on the server. Lesson state machine enforced on the server. Reviewer and tutor must agree. Read-only scopes; token never enters the page.
4. **What is next** (20 s). One topic polished today; the same loop works for any post with readable attachments.

## Likely judge questions

- **Where does the Google token live?** In the extension service worker only. The Classroom page never sees it. The worker sends it to our local API, which verifies access before fetching anything.
- **What goes to OpenAI?** Retrieved lesson passages and the student's answers. Not the token, not Drive listings. Model: the configured `OPENAI_MODEL` through the Responses API with strict JSON schemas.
- **How do you stop it making things up?** Citations must be exact substrings of retrieved passages; unverified replies are rejected and retried. Replies that skip a lesson step are rejected. Missing or denied files are named, never substituted.
- **Why an extension and not a Classroom add-on?** Students can install it without a school admin or Marketplace listing. Add-on distribution is out of scope for the day.
- **Does it grade or submit?** No. No grade passback, no turn-in. Draft review is coverage feedback, labelled as not a predicted grade.
- **Does it scale?** Local SQLite and process-local limits today. Horizontal deployment is a separate design.

## Verification on this machine

12 September 2026, 14:13 SGT, fresh worktree, `cd app && bun install && bun run check`:

| Check | Result |
| --- | --- |
| TypeScript | clean |
| Service and boundary tests | 77 pass, 3 skip (opt-in live provider tests), 0 fail |
| Web and extension build | built, extension ID `pdilhkaadeldjlpcnpebmhfchkoankec` |
| Browser tests (`PORT=8798 E2E_PORT=8798 CI=1 bun run test:e2e`) | 18 passed in Chromium, including loading the unpacked MV3 extension |

Not verified here and cannot be without the accounts: live school OAuth, Classroom DOM matching on the signed-in demo class, provider-generated teaching, microphone audio.

## Before 15:30

- [ ] On the demo account, open the demo class, tick the two electricity posts, and confirm both PDFs load in the overlay. If they do not, the demo has no fallback content by design; fix access first.
- [ ] Confirm the electricity notes contain the passages the wrong-answer beat relies on (series current is the same at every point; energy, not charge, is transferred). Pick another covered misconception if not.
- [ ] Record the video from the shot list. Two minutes hard limit.
- [ ] Paste the portal text above. Add real screenshots from the recording, not the brand illustrations.
- [ ] Fill sponsor handles and post.
