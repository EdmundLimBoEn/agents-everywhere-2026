# Hackathon scope

The demo must prove both real Classroom integration and adaptive teaching. [The PRD](./prd.md) is authoritative.

## Must work

- Browser extension on a real Classroom class, with working Stream and Classwork navigation.
- Selection across posts, topic study, assignment-related notes, and a Stream study entry.
- Authorized retrieval of attached Google Docs and PDFs, with visible per-file access failures.
- Same-tab overlay with readable document tabs and citations that navigate to exact supporting passages.
- Cross-document questions and an agent-led mini lesson with diagnostic, teaching, answer check, adaptation, teach-back, and recap.
- A Catch Up plan built from the selected posts within a stated time budget, with cited steps that reorder after a wrong answer.
- Student interruptions, learner evidence saved, and a shared whiteboard supporting the lesson, where the tutor marks its answer on the student's own drawing when asked. Voice is optional.
- Closing and reopening without losing the Classroom position or lesson progress.

## Primary demo

One topic, two real posts, two accessible attached PDFs. Use the two electricity notes from `notes/`, posted as materials under one topic in the demo class. Use actual teacher materials rather than fabricated files.

1. Open the real class's Stream, then Classwork; both remain usable.
2. Select the two electricity posts and click “Study these together.”
3. Fetch their attachments and show both readable document tabs.
4. Enter 15 minutes and click “Build my plan.” The steps cite the notes and fit the budget. Click “Start” on the first step.
5. Ask a question that needs both sources, for example how the current in a circuit relates to the rating of the fuse protecting it. Open the supporting passages.
6. Click “Teach me this topic.” The agent asks a diagnostic: in a series circuit with two lamps, is the current after the second lamp smaller than before the first?
7. Student answers “Yes, the lamps use up the current.” The agent diagnoses the current-is-consumed misconception and the plan puts that gap first.
8. Agent explains that current is the same at every point in a series circuit and that energy, not charge, is transferred to the lamps. It opens the passage or diagram in the notes that shows this. Use an actual available passage, not an assumed diagram.
9. Agent asks the student to predict two ammeter readings, then what happens to the current when a second lamp is added in series.
10. Student asks for a simpler explanation; the next teaching action responds to that request.
11. Student explains the concept back. The recap distinguishes demonstrated understanding from topics still needing practice and links the notes to revisit.
12. Close the overlay and continue on the same Classroom page. Reopen to resume.

Before the demo, confirm the electricity notes contain the passages steps 5 and 8 rely on. If they don't, pick a misconception the notes do cover.

## Acceptance checks before demo

- Live integration: verify real course/post/file identities and retrieved content; label any prototype separately.
- Selection: two posts share one session; duplicate attachments appear once; no selection cannot start a lesson.
- Access: a denied attachment is identified; readable files still work; another student's content cannot be retrieved.
- Sources: both cross-document citations open the correct document and passage; unavailable evidence produces an explicit limitation.
- Adaptation: run the same diagnostic with a wrong answer and a correct answer; verify different next actions. Rewording the same script does not pass.
- Plan: step minutes never exceed the budget; every step opens a real passage; the reviewer and tutor never disagree on a saved turn.
- Interruptions: simplify, example, why, and skip each affect the next action; skip alone does not increase mastery.
- Navigation: test Stream, Classwork, posts, original attachments, overlay close/reopen, keyboard use, and restored focus/scroll after Classroom page changes.
- Recovery: authorization expiry and retrieval failure offer a usable retry without invented sources or lost lesson state.
- Whiteboard: draw a shape and ask about it from the Whiteboard tab; the tutor's green marks appear next to that shape, the student's shapes are unchanged, and a reply pointing at a shape that is not on the board is rejected. Start a lesson with **Teach me at the whiteboard**; the tutor's diagram appears part by part and the parts it keeps survive the next turn.

These are implementation acceptance checks, not claims that the current repository passes them.

## Outside this demo

Teacher-installed add-on, grade passback, submission turn-in, teacher dashboards, iOS, offline teaching, collaboration, notifications, and broad subject coverage.
