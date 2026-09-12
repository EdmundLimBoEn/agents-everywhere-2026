# Classroom extension

The MV3 worker obtains Google authorization through `chrome.identity`. It forwards authenticated API requests to the fixed build-time `API_ORIGIN`; content scripts and the study iframe never receive the token. Connect is interactive only when selected by the student. Settings can clear cached authorization.

Build with the root build command and load the generated extension directory using Chrome → Extensions → Developer mode → Load unpacked. Configure `GOOGLE_CLIENT_ID`, the extension's stable key/ID, and the server origin as described in the app README. Enable Classroom and Drive APIs in the associated Google Cloud project. Account access and consent are required to retrieve real material.

Open a real course on classroom.google.com. The floating **Study notes** control opens the accessible modal study window. After connecting, verified API post IDs and alternate links are matched to Classroom elements. Matching posts receive selection, lesson, and topic controls. If Classroom changes its DOM, the study window's API-backed course/material picker remains available; unrelated native links are never intercepted. The extension does not fabricate posts or content.

Close with the close button or Escape to return to the previous focus and scroll position. Reopening the same selection retains the iframe and lesson. Stream/Classwork navigation remains native.

The **learning.md** button opens a downloadable, fictional learner-memory example, available before connecting Google. It illustrates tentative understanding, possible gaps, unchecked topics, supporting evidence, and the next teaching move. Edit `assets/learning.md` and rebuild to update it. The file is bundled into both the extension and local web app; it never populates real learner profiles. **My learning** continues to show actual saved observations.

Manual integration check: use an OAuth-authorized real test course with two readable attachments; connect, select both posts, open study, click a citation, close with Escape, navigate Stream/Classwork, reopen, and verify a denied attachment appears as a readable error. Real Google authorization and real Classroom DOM behavior must be checked using that account; fixture tests cannot prove those integrations.

Long retrieval and teaching requests use an opt-in NDJSON transport: the server sends immediate headers and periodic empty heartbeat records, followed by the final HTTP status and JSON body. The worker reads the stream incrementally, keeps its Chrome event alive during the request, and aborts after four minutes. A missing final envelope is an error, never a successful empty result. This avoids MV3's short fetch-response timeout without an indefinitely running worker. Responses are capped at 32 MiB, including encoded PDF previews.
