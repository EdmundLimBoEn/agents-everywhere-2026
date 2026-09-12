# Lesson state machine

Critical transitions are deterministic. Teaching-path choices can be model-selected. A real lesson starts from a Classroom add-on open or a companion deep link with Classroom ids.

## Entry

```text
classroom.addon.opened
→ load getAddOnContext
→ bind courseId, itemId, itemType, attachmentId, submissionId
→ IDLE
```

`GOAL_SELECTION` defaults to the coursework title, description, materials, and due date. The student can still override into freeform on that same item.

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
→ turn in / draft grade passback
```

## Teaching actions

The teaching agent may choose `explain`, `ask_question`, `retrieve_notes`, `retrieve_classroom_materials`, `draw`, `highlight`, `move_whiteboard_element`, `give_hint`, `show_example`, `simplify`, `switch_modality`, `test_prerequisite`, `retrieve_practice_question`, `generate_practice_question`, `mark_answer`, `update_mastery`, `turn_in_classroom`, or `end_lesson`.

When the student struggles, diagnose first, then pick an intervention: simpler explanation, analogy, diagram, worked example, prerequisite review, practice question, Socratic question, voice explanation, or whiteboard manipulation.

## Tools

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
→ Turn in or pass back grade when COMPLETE
→ Choose next action
```
