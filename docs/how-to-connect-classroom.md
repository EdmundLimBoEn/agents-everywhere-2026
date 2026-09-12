# How to connect Google Classroom

Use this when you stand up OAuth and the add-on for the first time.

## Before you start

1. Create a Google Cloud project. Enable Classroom API and Drive API.
2. Create OAuth client ids for the web add-on and for iOS.
3. Put test Google accounts (one teacher, one student) on the consent screen.
4. Create a Classroom class. Enrol the test student. Create one `courseWork` item for the demo topic.
5. Ask Edmund before picking OpenAI models. Classroom work does not need that answer.

## Register the add-on

In Google Workspace Marketplace SDK, mark Classroom add-on. Set:

- Attachment Setup URI to `https://<host>/addon/discovery`
- Allowed attachment URI prefixes to `/addon/`
- `studentViewUri`, `teacherViewUri`, `studentWorkReviewUri` as in [Google Classroom connections](./classroom.md)

For build day, an unlisted app with test users is enough if Marketplace review has not finished.

## Implement sign-in

1. Read `login_hint` from the iframe query.
2. If it matches the current session, skip the picker.
3. Otherwise start Google OAuth and pass `login_hint`.
4. Request student scopes on the student view. Request teacher scopes on discovery, teacher view, and review.
5. Store refresh tokens in `app/services/classroom` with a role slot. Do not reuse a student token for `pointsEarned`.

## Attach the agent

1. Teacher opens the demo assignment and chooses the add-on.
2. Discovery iframe lists our topics that already have `notes/classroom-links.yaml` rows for that `courseId`.
3. Teacher picks the Electricity topic.
4. Backend calls `addOnAttachments.create` with `addOnToken`, `studentWorkReviewUri`, and `maxPoints`.
5. Iframe sends `{ type: "Classroom", action: "closeIframe" }`.

## Open a student lesson

1. Student opens the assignment in Classroom.
2. Student view calls `getAddOnContext` and stores `submissionId`.
3. Backend loads coursework, materials, due date, linked notes, and learner profile.
4. The teaching loop starts from that item. See [Lesson state machine](./lesson-state-machine.md).

## Turn in and pass back a grade

1. Student finishes. Agent calls `turnInSubmission` when the item is `courseWork`.
2. Marker returns a score. Backend writes `pointsEarned` with the stored teacher token.
3. Teacher opens Classroom grader. Review iframe shows the board, transcript summary, and mark.

## Sync without the iframe

`app/scripts/classroom-sync` pulls courses, coursework, materials, and announcements for the signed-in teacher. Run it after the test class exists so ingest can resolve `itemId` values in `notes/classroom-links.yaml`.
