# Hackathon scope

The demo must prove both real Classroom integration and adaptive teaching. [The revised PRD](./prd.md) is authoritative over earlier add-on and standalone-app plans.

## Must work

- Browser extension on a real Classroom class, with working Stream and Classwork navigation.
- Selection across posts, topic study, assignment-related notes, and a Stream study entry.
- Authorized retrieval of attached Google Docs and PDFs, with visible per-file access failures.
- Same-tab overlay with readable document tabs and citations that navigate to exact supporting passages.
- Cross-document questions and an agent-led mini lesson with diagnostic, teaching, answer check, adaptation, teach-back, and recap.
- Student interruptions, learner evidence saved, voice, and a shared whiteboard supporting the lesson.
- Closing and reopening without losing the Classroom position or lesson progress.

## Primary demo

Use one topic with two real posts and two accessible attached documents. Photosynthesis is the proposed example; use actual teacher materials rather than fabricated files.

1. Open the real class's Stream, then Classwork; both remain usable.
2. Select two posts and click “Study these together.”
3. Fetch their attachments and show both readable document tabs.
4. Ask a question requiring both sources; open the supporting passages.
5. Click “Teach me this topic.” The agent asks what plants get from sunlight.
6. Student answers “Food.” The agent diagnoses the energy-versus-food misconception.
7. Agent explains that light supplies energy to make food and opens the relevant teacher diagram or passage. Use an actual available source, not an assumed diagram.
8. Agent asks the student to identify the food produced, then predict what happens without light.
9. Student asks for a simpler explanation; the next teaching action responds to that request.
10. Student explains the concept back. The recap distinguishes demonstrated understanding from topics still needing practice and links the notes to revisit.
11. Close the overlay and continue on the same Classroom page. Reopen to resume.

## Acceptance checks before demo

- Live integration: verify real course/post/file identities and retrieved content; label any prototype separately.
- Selection: two posts share one session; duplicate attachments appear once; no selection cannot start a lesson.
- Access: a denied attachment is identified; readable files still work; another student's content cannot be retrieved.
- Sources: both cross-document citations open the correct document and passage; unavailable evidence produces an explicit limitation.
- Adaptation: run the same diagnostic with a wrong answer and a correct answer; verify different next actions. Rewording the same script does not pass.
- Interruptions: simplify, example, why, and skip each affect the next action; skip alone does not increase mastery.
- Navigation: test Stream, Classwork, posts, original attachments, overlay close/reopen, keyboard use, and restored focus/scroll after Classroom page changes.
- Recovery: authorization expiry and retrieval failure offer a usable retry without invented sources or lost lesson state.

These are implementation acceptance checks, not claims that the current repository passes them.

## Outside this demo

Teacher-installed add-on discovery, grade passback, submission turn-in, custom teacher dashboards, full iOS parity, offline teaching, collaboration, notifications, advanced graph visualization, and broad subject coverage. Retain the broader roadmap without making these prerequisites for the extension demo.

## Work split

Machine 1 owns the extension, Classroom page integration, Google authorization, attachment loading, document viewer, overlay, voice transport, and platform. Machine 2 owns grounded retrieval, source anchors, teaching decisions, lesson state, learner evidence, and practice. Agree on the selected-source session contract first: course ID, selected post IDs and types, attachment IDs, source locations, learner ID, and lesson ID. Backend authorization validates these identifiers.

The older [two-machine split](./two-machine-split.md) is a reference for service ownership; its add-on-specific entry and grading requirements are superseded.
