# About hackathon scope

Judges should open a Classroom assignment and meet the agent there. A catalogue of unfinished modules is a miss. A polished web chat that never touches Classroom is also a miss.

## Must work

Google sign-in, Classroom add-on student view on one `courseWork` item, onboarding questionnaire, linked notes RAG, voice, whiteboard, the lesson state machine, learner profile, mastery updates, practice questions, citations, turn-in or draft grade passback, and a companion dashboard that still names the Classroom item.

## Cut first if time runs out

Offline mode, collaborative sessions, full iOS parity, notifications, advanced graph visualization, large subject coverage, Marketplace listing, Link Upgrade iframe, and writing new Classroom assignments from the agent.

Do not cut the add-on student view or the `notes/` to coursework link.

## Primary demo

Use one polished topic attached to a real Classroom assignment. Suggested script:

1. Teacher has already attached the add-on to Electricity homework.
2. Student opens that assignment in Classroom.
3. Add-on loads due date, materials, and linked notes.
4. Agent notices an algebra prerequisite weakness.
5. Agent explains current, voltage, and resistance by voice.
6. Agent draws a circuit.
7. Student states a misconception.
8. Agent recognizes it and switches method.
9. Agent retrieves the exact school note and a Classroom material.
10. Agent gives a school-paper-style question.
11. Student answers. Agent marks it.
12. Work turns in. Draft grade appears. Mastery rises.

## Daily integration check

If this path works, the project works:

```text
Classroom assignment opens
→ Machine 1 validates add-on context
→ Machine 1 loads coursework and submission
→ Machine 2 reads learner state and linked notes
→ Machine 2 chooses a teaching action
→ Machine 1 renders it in the iframe or companion
→ Machine 2 requests a whiteboard action
→ Machine 1 draws it
→ student submits an answer
→ Machine 2 marks it and updates mastery
→ Machine 1 turns in or passes back a draft grade
→ Classroom grader shows the review iframe
```

## Work split

Machine 1 owns product, Classroom OAuth, the add-on, platform, and realtime. Machine 2 owns AI, RAG, and teaching. Details live in [Two-machine split](./two-machine-split.md).
