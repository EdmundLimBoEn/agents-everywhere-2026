# Lesson whiteboard

The lesson Whiteboard tab embeds Excalidraw, bundled locally for the web app and Chrome extension. Students can draw, edit shapes and arrows, add text and images, undo/redo, and import/export Excalidraw files using its native controls.

Scenes autosave through the authenticated lesson board endpoint; Save retries failures. The in-memory draft survives tab changes, and teaching/voice wait for pending saves. Existing notes and strokes migrate on opening. Changed tutor diagrams replace their previous shapes while unrelated student drawings remain.

The optional `Board.scene` stores elements (including deletion markers), embedded image files, and the source items used to reconcile tutor updates. Existing `items` and `strokes` remain compatible with older lessons. Pan, zoom, selection and undo history are session-only. No multiplayer service is configured.

Board requests are capped at 10 MB, 2,000 scene elements and 100 embedded images. Invalid geometry, duplicate IDs, external image URLs, unsafe links and embedded webpages are rejected. Failed saves retain the current draft; reduce oversized content and retry before closing the lesson.

Run `cd app && bun run check && bun run test:e2e`. `scripts/build.ts` bundles the editor and copies its fonts to both distribution folders; no drawing-site account is required.
