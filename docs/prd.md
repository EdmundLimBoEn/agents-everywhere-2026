# About the Adaptive AI Study Agent

This product is a teaching agent that lives inside Google Classroom. Students already open courses, assignments, materials, and due dates there. The agent appears on that coursework. It is not a chatbot that waits in a separate window and optionally syncs Classroom later.

The ChatGPT plan still defines teaching behavior: voice, RAG over school notes, a shared whiteboard, mastery, and an explicit lesson state machine. Classroom is the place that work happens.

## Theme

The hackathon starts from this premise. The most useful agents show up inside the tools where people already have work to do. Most agents still wait in a separate chat window.

Students and teachers already have work in Classroom. The assignment is the job. The agent belongs on that assignment. See [Why this belongs in Classroom](./theme-fit.md).

## Who it is for

SST students (and later any class that uses Classroom). Teachers attach the agent to coursework inside Classroom. They review student work in Classroom's grader. There is no separate teacher console.

The team, not the student, dumps curriculum PDFs into `notes/`. Those files must link to Classroom coursework or materials. Classroom itself is also a live source of assignments, announcements, Drive attachments, due dates, submissions, and grades.

## Where the agent lives

The primary surface is a Google Classroom add-on. Classroom loads it in iframes on the Stream item.

| Iframe | Who | Job |
| --- | --- | --- |
| Attachment Discovery | Teacher | Attach the agent to an assignment, material, or announcement |
| Student View | Student | Learn on that item. Voice, whiteboard, practice, submit |
| Teacher View | Teacher | Preview the same attachment |
| Student Work Review | Teacher | See the lesson, board, and mark in Classroom's grader |

The Next.js web app and the SwiftUI iOS app are companion surfaces. They open from a Classroom item (`courseId` + `itemId`). Use them when the iframe is too tight for live voice or a full whiteboard. They do not replace Classroom as home.

## What the student can do

The student opens a Classroom assignment. The add-on already knows the course, the item, the due date, attached materials, and any prior submission. Teaching starts from that context.

The student talks with GPT Live, shares a whiteboard, answers practice questions, and turns work back into Classroom. Mastery updates in our learner model. A draft grade can pass back onto the add-on attachment when the teacher attached an activity with `maxPoints`.

A short onboarding questionnaire still captures how they like to learn. The profile then updates from real behavior. Students can inspect and edit what the system remembers about them.

## What the agent does

The agent reads Classroom context first. Course, coursework, materials, announcements, submission state, due date, and linked notes. Then it reads the learner profile and mastery, picks a lesson state, retrieves school material, and teaches by voice, text, or whiteboard.

It can run two lesson shapes:

- Freeform tutoring on the current Classroom item
- A structured lesson whose objective is that coursework's title, due date, and materials

When the student is stuck, the agent diagnoses first. It then changes method. It does not repeat the same explanation with different words.

## Grounding

Answers that come from school notes or Classroom materials carry source chips. Example: `[SST Science Notes p. 14]` or `[Classroom · Electricity HW]`. External enrichment is allowed when the student asks to go deeper. Those sources stay labeled apart.

Practice papers stay first-class. The agent also treats Classroom `courseWork` as assigned practice when the item is a question or assignment. Generated extras are marked as AI-generated.

## Modes

Learning mode favors understanding, diagrams, and discussion. Exam mode favors marks, speed, school answer style, archetypes, and timing. Upcoming Classroom due dates can trigger exam mode.

## What the demo must prove

One continuous path that starts in Classroom, not in our own home screen:

```text
student opens a Classroom assignment
→ add-on loads course, due date, materials, prior submission
→ agent teaches by voice
→ agent draws on the shared whiteboard
→ misconception detected
→ strategy change
→ retrieve linked school notes and Classroom materials
→ matched practice question
→ student turns work in to Classroom
→ mastery updates
→ draft grade appears on the Classroom item
```

Prepare one polished topic first. The plan's example is Physics, Electricity, attached to a real Classroom `courseWork` item.

## What this is not

It is not a standalone chat with a Classroom toggle. It is not a custom teacher dashboard. Teachers stay in Classroom. The agent stays clearly AI, avoids sycophancy, and can disagree when the student is wrong.

## Pitch

An AI teacher that meets you on the Classroom assignment you already have to do. It knows that coursework, your school's notes, what you misunderstand, and what to teach next.
