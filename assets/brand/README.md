# AfterClass brand & product kit

Open [the visual gallery](index.html) or download [the complete ZIP](../afterclass-brand-kit.zip). This kit uses **AfterClass**, with a capital A and C. It extends the current app’s green clarity mark and supersedes the older speech-leaf emblem in the Devpost concept kit.

## Files

| File | Dimensions | Use |
| --- | --- | --- |
| [Brand sheet](brand-board.png) | 1600 × 1200 | Identity, palette, typography, voice, and illustration reference |
| [Social card](social-card.png) | 1200 × 630 | Link preview or social graphic |
| [Demo cover](demo-cover.png) | 1920 × 1080 | Presentation opener with a product screenshot |
| [Whiteboard sheet](whiteboard-sheet.png) | 1600 × 1320 | Product gallery image with an intact screenshot |
| [Primary logo SVG](logo.svg) / [PNG](logo.png) | SVG 480 × 100; PNG 960 × 200 | Dark wordmark on a light background |
| [Reversed logo SVG](logo-reversed.svg) / [PNG](logo-reversed.png) | SVG 480 × 100; PNG 960 × 200 | Light wordmark on an ink or forest background |
| [Mark SVG](mark.svg) | Scalable; 40 × 40 viewBox | App emblem and favicon source |
| Mark PNGs: [32](mark-32.png), [128](mark-128.png), [512](mark-512.png) | Square, at the named pixel sizes | Favicon, extension icon, or project avatar |
| [Catch Up desktop](screenshots/catch-up-desktop.png) | 1440 × 1381 | Original full-page browser-test capture |
| [Catch Up mobile](screenshots/catch-up-mobile.png) | 390 × 2664 | Original full-page capture at a narrow viewport |
| [Lesson and citations](screenshots/lesson-citations.png) | 1280 × 720 | Original lesson capture |
| [Whiteboard](screenshots/whiteboard-forces.png) | 1600 × 1100 | Original force-diagram capture |

The SVGs and HTML layouts are editable. PNG logos preserve the rendered lettering and have transparent backgrounds. SVG wordmarks use live text: Avenir Next, with Trebuchet MS and sans-serif fallbacks. Fonts are not bundled, so use the PNGs for identical lettering on another machine. The mark is pure vector geometry and has no font dependency. These files are supplied as a brand kit; app source and extension configuration are not changed.

## Identity

**Positioning:** An adaptive AI teacher inside Google Classroom.

**Brand promise:** A little clarity. A lot of possibility.

**Campaign line:** Your notes. Your pace. Your next breakthrough.

**Short description:** AfterClass turns your teacher’s materials into cited lessons and a manageable catch-up plan, with a shared whiteboard to work through ideas.

**Voice:** Patient, specific, encouraging. Use “Let’s take it one step at a time” and “Show me how you got there.” Explain the next action in plain words. Describe observed progress without declaring mastery from a checklist.

### Mark and wordmark

The four-point clarity mark comes from the current app favicon in `app/scripts/build.ts`. It represents a moment of understanding and keeps the brand aligned with the shipped interface. Use the full wordmark when introducing the product; use the mark alone where the name already appears.

Keep at least one quarter of the mark’s height clear around the logo. Display the horizontal logo at 160 px wide or larger and the mark at 16 px or larger. Preserve aspect ratio. Use the primary logo on paper or white and the reversed logo on ink or forest. Keep the logo clear of screenshot content and illustration details.

### Color and typography

| Token | Hex | Role |
| --- | --- | --- |
| Ink | `#263C33` | Main text; dark brand panels |
| Forest | `#187C55` | Mark, primary actions, emphasis |
| Paper | `#F9FAF7` | Main background and negative space |
| Sage | `#EDF3E9` | Supporting surfaces |
| Ochre | `#AD762E` | Small decorative accents |

These values follow `app/apps/web/src/study/style.css`. Use ink on paper for body text and white on forest for actions. Reserve ochre for accents; avoid small white text on ochre. Use **Georgia** for editorial headlines and **Avenir Next** for the wordmark, labels, and interface, with **Trebuchet MS / sans-serif** as fallbacks. Keep marketing headlines spacious and interface copy compact.

The paper-cut illustrations in [the illustration guide](../afterclass/README.md) support Catch Up, whiteboard introduction, and lesson recap. They were created with the built-in imagegen tool. The current kit reuses those originals. Decorative imagery uses empty alt text when adjacent copy already explains it. The brand layouts are native HTML/CSS and SVG rendered by Chromium; the screenshots are not AI-generated.

## Screenshot provenance

Captured September 12, 2026 from a fresh local build, using the repository’s existing Playwright scenarios. All four screenshots are unaltered copies of the resulting PNGs. **Classroom and tutor responses are mocked.** The biology and physics passages are existing synthetic test fixtures; no new demo notes or documents were invented for the kit. No authenticated Classroom tab was open during this capture.

| Capture | Existing scenario in `app/tests/e2e/study.spec.ts` |
| --- | --- |
| Catch Up desktop and mobile | `dashboard builds a cited plan, remembers checkmarks and opens the tutor at the source` |
| Lesson and citations | `selected posts, adaptive response, exact citation and saved lesson resume` |
| Whiteboard | `whiteboard physics rendering: car` |

The “Tutor-generated” wording inside the physics screenshot is part of the existing test response; it is not evidence of a live model call. Mocked lesson state and labels are preserved as captured, including the app’s current “Afterclass” casing. New brand graphics use “AfterClass.” The mobile image demonstrates a responsive viewport, not a separate mobile application or mobile Chrome extension.

Keep the browser-test caption when using the framed product graphics. Raw captures should be captioned “Current app interface — browser-test preview with mocked services.” Replace them with authorized live captures when claiming a live Classroom or model demonstration. Nothing has been uploaded or published.

## Reproduce and verify

From the repository root, with the project dependencies and Playwright Chromium installed:

```sh
cd app
bun run build
E2E_PORT=8797 bun run test:e2e tests/e2e/study.spec.ts \
  --grep 'selected posts, adaptive response|dashboard builds a cited plan|whiteboard physics rendering: car' \
  --workers=1 --output=test-results/brand-capture
cd ..
node assets/brand/render.mjs
```

The capture command produces fresh originals under `app/test-results/brand-capture/`. Copy `catch-up-dashboard-desktop.png`, `catch-up-dashboard-mobile.png`, `lesson.png`, and `car.png` to the corresponding named files in `screenshots/` before re-rendering. `render.mjs` exports the four native layouts, two PNG logos, and three icon sizes; it checks image loading, export dimensions, artboard boundaries, gallery width at 1440 and 390 px, and browser errors.

Validation for this kit: build passed; all 3 browser scenarios passed; renderer checks passed; all four layouts and the original desktop captures were visually inspected. The archive contains only this kit and the illustration directory, with no browser profile, credentials, database, or test traces.
