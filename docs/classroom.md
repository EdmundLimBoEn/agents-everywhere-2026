# Google Classroom connections

> Planning revision: [the current PRD](./prd.md) and [hackathon scope](./hackathon-scope.md) take precedence. The primary surface is now a browser extension with a multi-post study overlay. Earlier add-on, single-item session, turn-in, and grading requirements below are historical and must be reconciled before implementation.

Classroom is the primary surface and a live data source. This page lists the real Google objects, iframes, OAuth scopes, and our mappings. It does not argue for the product. See [Why this belongs in Classroom](./theme-fit.md) for that.

Official references:

- Add-on iframes: https://developers.google.com/workspace/classroom/add-ons/developer-guides/iframes
- Attachment interactions: https://developers.google.com/workspace/classroom/add-ons/developer-guides/attachment-interactions
- Activity attachments: https://developers.google.com/workspace/classroom/add-ons/walkthroughs/activity-attachments
- Grade passback: https://developers.google.com/workspace/classroom/add-ons/walkthroughs/grade-passback
- Auth scopes: https://developers.google.com/workspace/classroom/guides/auth
- REST: https://classroom.googleapis.com/v1/...

## Surfaces we ship

Register a Classroom add-on in the Google Workspace Marketplace SDK. The Next.js app serves every iframe under `app/apps/web` routes owned by `app/apps/web/src/classroom-addon`.

| Route | Classroom URI | Query parameters |
| --- | --- | --- |
| `/addon/discovery` | Attachment Setup URI | `courseId`, `itemId`, `itemType`, `addOnToken`, `login_hint` |
| `/addon/student` | `studentViewUri` | `courseId`, `itemId`, `itemType`, `attachmentId`, `login_hint` |
| `/addon/teacher` | `teacherViewUri` | same as student view |
| `/addon/review` | `studentWorkReviewUri` | those plus `submissionId` |
| `/addon/upgrade` | Link Upgrade URI | discovery params plus `urlToUpgrade` |

`itemType` is `courseWork`, `courseWorkMaterials`, or `announcements`.

On load, call the matching `getAddOnContext` method (`courses.courseWork.getAddOnContext`, `courses.courseWorkMaterials.getAddOnContext`, or `courses.announcements.getAddOnContext`). Use the response to learn `TeacherContext` versus `StudentContext`. For a student on `courseWork`, store `submissionId`.

Close a discovery or upgrade iframe with:

```js
window.parent.postMessage({ type: "Classroom", action: "closeIframe" }, "*")
```

Iframe sandbox includes `allow="microphone *"`. Voice can run in the add-on. If the board needs more room, the student view offers "Open full lesson" to the companion web or iOS route with the same Classroom ids.

Create activity-type attachments so teachers can review work. That means set `studentWorkReviewUri` and a positive `maxPoints` when creating `addOnAttachments`.

## Classroom objects we read

| Resource | Use |
| --- | --- |
| `courses` | The student's real class list. This is home, not a subject picker we invent. |
| `courses.courseWork` | Assignments and questions. A lesson binds to one item. Due date, `maxPoints`, description, and materials drive the lesson goal. |
| `courses.courseWorkMaterials` | Teacher-posted notes and files. Ingest and cite them. |
| `courses.announcements` | Class-wide notices the agent can mention when they affect the topic. |
| `courses.topics` | Classroom topic folders. Map onto our topic graph when names match. |
| `courses.courseWork.studentSubmissions` | State, due work, assigned grade, draft grade. Turn-in is a teaching action. |
| `courses.courseWork.addOnAttachments` | Our attachment on that item. |
| `courses.courseWork.addOnAttachments.studentSubmissions` | Add-on submission state and `pointsEarned` passback. |
| Drive files on materials | Linked PDFs and Docs. Fetch with Drive readonly when the teacher attached them. |

Do not invent a parallel assignment list. Show Classroom's.

## Classroom objects we write

| Write | When | Who |
| --- | --- | --- |
| `addOnAttachments.create` | Teacher finishes discovery | Teacher + `addOnToken` |
| Student work in our DB | During the lesson | Student |
| `studentSubmissions.turnIn` | Student finishes the activity | Student, when the item is coursework |
| `addOnAttachments.studentSubmissions.patch` `pointsEarned` | Pass back a draft grade | Teacher scope only. Use stored teacher tokens. Never give `classroom.addons.teacher` to a student. |

Hackathon default: pass back a draft grade on the add-on attachment. Teachers keep final say in Classroom. Do not overwrite an assigned grade the teacher already returned.

## OAuth

Google sign-in is required. Apple and email from the original chat are deferred. Classroom will not load without a Google account in the class.

Keep student and teacher tokens apart.

Student consent (start here):

```text
openid
email
profile
https://www.googleapis.com/auth/classroom.addons.student
https://www.googleapis.com/auth/classroom.courses.readonly
https://www.googleapis.com/auth/classroom.coursework.me.readonly
https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly
https://www.googleapis.com/auth/classroom.announcements.readonly
https://www.googleapis.com/auth/classroom.student-submissions.me.readonly
```

Add `classroom.coursework.me` only when turn-in is implemented.

Teacher consent (attach and grade passback):

```text
openid
email
profile
https://www.googleapis.com/auth/classroom.addons.teacher
https://www.googleapis.com/auth/classroom.courses.readonly
https://www.googleapis.com/auth/classroom.coursework.students.readonly
https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly
https://www.googleapis.com/auth/classroom.announcements.readonly
https://www.googleapis.com/auth/classroom.rosters.readonly
```

Store teacher refresh tokens so student submit can pass back `pointsEarned` without promoting the student to teacher. See Google's grade passback walkthrough.

`login_hint` arrives on every iframe. Pass it into Google's auth request so the account picker can skip. Compare it to the signed-in user before trusting the session.

Hackathon note: Marketplace review for add-on scopes takes days. For the build day, run a Google Cloud project with Classroom API enabled, test users on the OAuth consent screen, and a teacher test class. Document the Attachment Setup URI even if Marketplace listing stays unlisted.

## Notes to coursework

Every PDF in `notes/` must declare which Classroom item it supports. The manifest is `notes/classroom-links.yaml`. Schema lives in `app/packages/schemas`. Ingest refuses an unlinked file for demo content.

A link record has:

```text
path          notes-relative PDF path
courseId      Classroom course
itemType      courseWork | courseWorkMaterials | announcements
itemId        that item
driveFileId   optional, if Classroom already hosts the same file
topic         our topic key, e.g. physics/electricity
```

Classroom materials are ingested too. They do not have to appear in `notes/`. `notes/` is the scrape dump for papers and notes the class did not upload.

## Agent tools

These tools are Classroom-native. They sit beside `searchNotes`, not behind a feature flag.

| Tool | Classroom call |
| --- | --- |
| `listCourses` | `courses.list` |
| `getCourseWork` | `courses.courseWork.get` |
| `listCourseMaterials` | `courseWorkMaterials.list` plus Drive files on the item |
| `listAnnouncements` | `courses.announcements.list` |
| `getSubmission` | `studentSubmissions.get` |
| `turnInSubmission` | `studentSubmissions.turnIn` |
| `passBackDraftGrade` | add-on `studentSubmissions.patch` with teacher tokens |
| `createAddOnAttachment` | `addOnAttachments.create` |
| `getAddOnContext` | matching `getAddOnContext` |

## Events

Add these to the shared event list:

```text
classroom.course.synced
classroom.coursework.synced
classroom.material.ingested
classroom.submission.changed
classroom.grade.passed_back
classroom.addon.opened
```
