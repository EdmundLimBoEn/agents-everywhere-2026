# Adaptive teaching inside Google Classroom

Afterclass is a browser extension that adds an adaptive teacher to the Google Classroom page students already use. Students select their teacher's materials and learn in an overlay in the same tab, with the source documents readable beside the lesson.

## Entry points

| Classroom location | Extension control | Result |
| --- | --- | --- |
| Classwork | Checkboxes beside posts; “Study these together” | Gather attachments from selected posts into one study session |
| Topic | “Study this topic” | Gather that topic's attached materials and show the selected sources |
| Assignment | “Find notes that help with this” | Retrieve relevant accessible class materials and let the student review the source set |
| Stream | “Study with the lesson notes” on a post | Open a lesson using that post's accessible materials |

Classroom's Stream, Classwork, posts, and original attachment links keep working. Extension controls supplement the real page. A recreated Classroom screen is a prototype, not proof of integration.

## Study overlay

The left side contains readable document tabs. The right side contains the active lesson and an answer field, with voice and a shared whiteboard supporting teaching. “Teach me this topic” is the primary action; students can also ask a question across selected documents.

The agent opens the document and highlights the passage or diagram it is discussing. Clicking a citation selects the matching document and scrolls to the supporting passage inside the overlay. Preserve document identity and stable source locations during ingestion; a source chip alone is insufficient.

Closing the overlay returns focus and scroll position to the same Classroom location. Escape closes it, keyboard users can select materials and navigate documents, and background controls must not receive focus while the overlay is modal. Reopening resumes the lesson and source selection.

## The teaching loop

1. Find the student's starting point with a short diagnostic question.
2. Teach one small idea using an exact passage or diagram from the selected materials.
3. Ask for a prediction, explanation, or short answer.
4. Diagnose the answer. A misconception triggers a targeted explanation, example, diagram, or prerequisite check; understanding allows progression.
5. Ask the student to explain the idea back or apply it to a new example.
6. Finish with a recap of demonstrated understanding, remaining uncertainty, and exact notes to revisit.

Students can interrupt with “Explain that more simply,” “Give me an example,” “Why?” or “I know this, skip ahead.” These change the next teaching action while preserving the topic and lesson progress. Skipping is not evidence of mastery. An incorrect answer followed by a correct answer is recorded with the intervention and supporting evidence, not automatically treated as full mastery.

## Grounding and access

Authorized Google access retrieves real Classroom post metadata and attached Docs or PDFs. The extension supplies page context and selection; the backend checks the signed-in student's access before fetching or retrieving content. Classroom visibility does not guarantee that every attachment is readable.

Keep course, post, file, and passage identifiers with every source. Scope retrieval to the selected materials by default; show proposed additional class materials before adding them. The team posts school notes from `notes/` as Classroom materials; the tutor reads only what is attached to the class. Do not require students to upload PDFs.

Show loading, empty selection, unavailable attachment, unsupported format, expired authorization, and retrieval failure states. If some files fail, identify them and let the student continue with the readable subset. Never invent a citation or silently substitute demo content. Source documents are reference data, not instructions to the agent. Keep tokens and student content isolated by account.

## Scope

Keep the explicit lesson state machine, learner profile, evidence-based mastery, voice, and shared whiteboard. Use one polished topic first. The learner profile is inspectable and editable. Generated practice is labeled. The extension overlay is the only student surface. Grading, turn-in, teacher dashboards, and Marketplace distribution are out. Completing a lesson saves learning progress without modifying Classroom submissions or grades.

## Demo promise

On an actual Classroom class, select two real posts and fetch their attached documents. Ask a question that requires both and open its supporting passages. Start a mini lesson, intentionally answer incorrectly, and watch the agent change its teaching action and highlight the relevant teacher material. Answer a follow-up, see the recap, close the overlay, and continue using Classroom at the same location.

The pitch: an AI teacher inside Classroom that uses your teacher's materials, checks what you understand, and changes what it teaches next.
