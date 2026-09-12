# Lesson state machine

Critical transitions are deterministic. Teaching-path choices can be model-selected. A real lesson starts from the extension overlay with selected Classroom posts and authorized source documents. See the current [PRD](./prd.md).

## Entry

```text
classroom.study.opened
→ validate signed-in access to course and selected posts
→ load readable attachments and stable source locations
→ bind courseId, selectedPosts[], sources[], learnerId, lessonId
→ IDLE
```

`GOAL_SELECTION` uses the selected materials and optional assignment context. “Teach me this topic” starts a diagnostic; cross-document Q&A uses the same sources. Partial attachment failures are visible before teaching begins.

## States

```text
IDLE
→ GOAL_SELECTION
→ ASSESS_PRIOR_KNOWLEDGE
→ TEACH
→ CHECK_UNDERSTANDING
→ DIAGNOSE
→ RETEACH or PRACTICE
→ ASSESS
→ UPDATE_MASTERY
→ SUMMARY
→ COMPLETE
→ save recap with source links and learner evidence
```

## Teaching actions

The teaching agent may choose `explain`, `ask_question`, `retrieve_notes`, `retrieve_classroom_materials`, `draw`, `highlight`, `move_whiteboard_element`, `give_hint`, `show_example`, `simplify`, `switch_modality`, `test_prerequisite`, `retrieve_practice_question`, `generate_practice_question`, `mark_answer`, `update_mastery`, `open_source`, or `end_lesson`.

When the student struggles, diagnose first, then pick an intervention: simpler explanation, analogy, diagram, worked example, prerequisite review, practice question, Socratic question, voice explanation, or whiteboard manipulation.

## Tools

The table below retains the broader integration roadmap. Add-on context, attachment creation, submission, and grade tools are not part of the extension demo. `open_source` selects a loaded document and its passage or diagram in the overlay.

Machine 2 implements teaching behavior. Machine 1 exposes `POST /agent/tools/:toolName` and owns Classroom OAuth.

| Tool | Purpose |
| --- | --- |
| `listCourses` | Classroom courses for this user |
| `getCourseWork` | Current assignment or question |
| `listCourseMaterials` | Materials and Drive files on the item or course |
| `listAnnouncements` | Recent class announcements |
| `getSubmission` | Classroom submission state |
| `turnInSubmission` | Turn the coursework in |
| `passBackDraftGrade` | Add-on `pointsEarned` with teacher tokens |
| `createAddOnAttachment` | Teacher discovery |
| `getAddOnContext` | Role and `submissionId` |
| `searchNotes` | Hybrid retrieval over linked `notes/` PDFs |
| `searchPracticePapers` | Find real paper questions |
| `getTopicGraph` | Prerequisite and related topics |
| `getLearnerProfile` | Preferences and current mastery |
| `updateMastery` | Write mastery evidence |
| `recordMisconception` | Store a diagnosed misconception |
| `getPracticeQuestion` | Match weakness and difficulty |
| `generatePracticeQuestion` | School-style generated item |
| `markAnswer` | Scheme plus conceptual mark |
| `getWhiteboard` / `modifyWhiteboard` | Read or request board actions |
| `saveLesson` / `saveLessonSummary` | Persist lesson close-out |
| `getPreviousLesson` | Reopen history on this coursework |
| `recommendNextTopic` | Next Classroom item or revision target |

## Core loop

```text
Observe student and Classroom item
→ Read learner profile + mastery + due date
→ Determine lesson state
→ Retrieve linked notes and Classroom materials
→ Choose teaching action
→ Teach via voice, text, or whiteboard
→ Check understanding
→ Diagnose mistakes
→ Update learner model
→ Save recap and source links when COMPLETE
→ Choose next action
```

## Observable adaptation

An incorrect diagnostic answer routes through `DIAGNOSE` and a targeted intervention before another check. A correct answer can advance to application practice. Simplify, example, why, and skip requests affect the next action without discarding lesson context. Skipping is not mastery evidence. Each source-backed teaching action identifies the source location to open or highlight. The final teach-back supplies evidence for the recap; uncertainty remains visible.
