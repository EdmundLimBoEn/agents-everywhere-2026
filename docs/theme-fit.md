# Why this belongs in Classroom

> Planning revision: [the current PRD](./prd.md) and [hackathon scope](./hackathon-scope.md) take precedence. The primary surface is now a browser extension with a multi-post study overlay. Earlier add-on, single-item session, turn-in, and grading requirements below are historical and must be reconciled before implementation.

The hackathon rejects agents that wait in a separate chat window. The useful ones show up where people already have work.

Students already have work in Google Classroom. Courses, assignments, materials, announcements, due dates, submissions, and grades are that work. Teachers already create those items and grade them there. A teaching agent that lives somewhere else asks everyone to leave the job to talk about the job.

## Mapping to the theme

The theme lists workplaces, pockets, the web, and the room as examples, not tracks. This project sits on more than one of those at once.

| Theme example | This product |
| --- | --- |
| Documents, calendars, tickets, live collaboration | Classroom coursework, materials, due dates, and the shared lesson on an assignment |
| Messaging, mobile, notifications, short async moments | iOS companion plus push from Classroom due dates and mastery decay |
| Browsers and software where an agent can take action | Classroom add-on iframes that read coursework and turn in submissions |
| Voice and other physical-world interfaces | GPT Live on the assignment, not in a detached chat |

The home surface is Classroom. Voice and the whiteboard are how the agent teaches once it is already on the assignment.

## What "main focus" means

Classroom is not a later integration. It is the product's location and a primary data source.

The agent starts from `courseId`, `itemId`, and `itemType`. It reads coursework, materials, announcements, submissions, and due dates through the Classroom API. Scraped PDFs in `notes/` exist to deepen that same coursework. They do not replace it.

If Classroom is down or the user has no course, there is no product to demo. A local lesson UI without a Classroom item is a fallback for development, not the pitch.

## What we refuse

A web app whose first screen is "Start Learning" with Classroom listed under settings. That is the separate chat window the theme is against.

The first screen a judge should see is a Classroom assignment with our add-on attached.
