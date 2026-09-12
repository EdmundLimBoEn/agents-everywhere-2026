# Data model

> Planning revision: [the current PRD](./prd.md) and [hackathon scope](./hackathon-scope.md) take precedence. The primary surface is now a browser extension with a multi-post study overlay. Earlier add-on, single-item session, turn-in, and grading requirements below are historical and must be reconciled before implementation.

Canonical entities are relational. Graph and vector stores hold relationships and embeddings. Types in `app/packages/schemas` match this page. A lesson without a Classroom item is a mock-only state.

## Classroom

```text
ClassroomUser
├── googleSub
├── email
├── roleInCourse          student | teacher
└── refreshTokenSlot      student vs teacher, never mixed

Course
├── courseId
├── name
├── section
└── enrollmentCode        stored only if Classroom returns it

CourseWorkItem
├── courseId
├── itemId
├── itemType              courseWork | courseWorkMaterials | announcements
├── title
├── description
├── dueDate
├── maxPoints
├── topicId
├── materials[]           Drive files, links, YouTube
└── addOnAttachmentId

Submission
├── courseId
├── itemId
├── submissionId
├── state                 NEW | CREATED | TURNED_IN | RETURNED | RECLAIMED
├── assignedGrade
├── draftGrade
└── addOnPointsEarned
```

Our user id is the Google `sub`. School identity is Classroom enrollment.

## Notes link

```text
NoteLink
├── path                  relative to notes/
├── courseId
├── itemType
├── itemId
├── driveFileId           optional
└── topic
```

Ingest reads `notes/classroom-links.yaml` into `NoteLink` rows. Retrieval hits can come from a scraped PDF or from a Classroom material. Both cite their source.

## Learner

A student has preferences, goals, subject mastery, topic mastery, confidence, misconceptions, mistakes, question-archetype weaknesses, intervention history, successful explanation styles, spaced-repetition state, and lesson history.

Mastery is not one score. Each mastery record stores mastery score, confidence, evidence, last tested, decay, questions attempted, hints used, response time, and explanation quality.

Pedagogically distinct outcomes: correct and confident, correct and unsure, wrong and confident, wrong and unsure.

Upcoming Classroom due dates feed spaced-repetition and exam-mode suggestions.

## Memory

Conversations stay searchable. Only learning-relevant facts become structured memory. Students inspect, edit, and delete structured memory.

## School content

A source document is a PDF dumped in `notes/` or a file Classroom already attached. After ingest it has subject, topic, subtopic, page, document id, source type, Classroom ids, and optional diagram, table, and question references.

A retrieval hit returns chunk text plus document, page, subject, topic, subtopic, source type, relevance, graph context, and Classroom ids when present.

## Practice

A practice item stores question, marks, topic, subtopic, difficulty, archetype, answer, mark scheme, paper, and year. A Classroom `courseWork` of type assignment or short-answer question can be the assigned practice item for that lesson.

A mark result stores score, maxScore, correctness, missingPoints, misconception, feedback, and suggestedNextAction. `maxScore` should match `courseWork.maxPoints` when the item is graded coursework.

Generated questions are flagged as AI-generated.

## Lesson

A lesson binds to one Classroom item.

```text
Lesson
├── courseId
├── itemId
├── itemType
├── attachmentId
├── submissionId
├── studentIds            1, or 2–4 for a shared session
├── mode                  learning | exam
├── goal                  defaults to coursework title + due date
├── state                 lesson state machine
├── whiteboardId
└── plan
```

Shared collaborative sessions share voice, board, lesson, and questions. Per-student participation analytics are out of MVP.

## Whiteboard

A board has scene JSON (web Excalidraw), a native PencilKit mapping on iOS, lessonId, Classroom ids, studentId, and timestamps. Boards persist across lessons on the same coursework.

## Events

Typed events include `lesson.started`, `lesson.state.changed`, `message.created`, `whiteboard.changed`, `practice.question.presented`, `practice.answer.submitted`, `practice.answer.marked`, `mastery.updated`, `misconception.recorded`, `agent.tool.called`, `agent.tool.completed`, `lesson.completed`, `classroom.course.synced`, `classroom.coursework.synced`, `classroom.material.ingested`, `classroom.submission.changed`, `classroom.grade.passed_back`, and `classroom.addon.opened`.

## Storage split

| Store | Owns |
| --- | --- |
| Relational | users, Classroom ids, courses, items, submissions, lessons, messages, whiteboards, mastery, preferences, note links |
| Object storage | PDFs, images, board snapshots, lesson exports |
| Vector | RAG embeddings |
| Graph | REQUIRES, RELATED_TO, APPEARS_IN, TESTS, USES_SKILL, HAS_MISCONCEPTION, BELONGS_TO, SUPPORTS_COURSEWORK |
