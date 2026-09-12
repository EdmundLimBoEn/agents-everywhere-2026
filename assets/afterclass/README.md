# Afterclass illustrations

See the [AfterClass brand kit](../brand/README.md) for editable logos, launch graphics, and current interface screenshots that use these illustrations.

Created with the built-in imagegen tool. The Catch Up, whiteboard, and lesson-completion illustrations use the current `app/apps/web/src/study/style.css` palette: paper `#f9faf7`, ink `#263c33`, green `#187c55`, sage `#edf3e9`, and ochre `#ad762e`. The original welcome illustrations retain the earlier warm-paper palette.

| Asset | Size | Intended use |
| --- | --- | --- |
| [Learning hero](learning-hero.png) | 1536 × 1024 | Welcome screen, presentation, or marketing illustration |
| [Ready to study](ready-to-study.png) | 1254 × 1254 | Pre-lesson or empty-state illustration |
| [Catch-up plan](catch-up-plan.png) | 1536 × 1024 | Catch Up introduction or pre-plan state; suggested display width 360–480 px |
| [Whiteboard together](whiteboard-together.png) | 1254 × 1254 | Whiteboard introduction; suggested display width 160–280 px |
| [Lesson complete](lesson-complete.png) | 1254 × 1254 | Completed-lesson recap; suggested display width 160–280 px |

All PNGs have opaque backgrounds. The three current app illustrations target near-white paper; the two original illustrations use warm paper. Preserve aspect ratio with `height: auto` or `object-fit: contain`; place copy outside the artwork. These are decorative illustrations, not teaching materials or real Classroom documents. Use empty alt text when adjacent text already communicates their purpose. Keep whiteboard artwork in the introduction, outside the editable drawing surface. Use the completed-lesson artwork beside a recap, without implying mastery or a score. Assets are supplied separately; no app layout changes are included.

Validation: all three new images were visually inspected, their PNG format and dimensions checked with `sips`, and their saved bytes verified against the generated originals with SHA-256.

## Generation prompts

### Learning hero

Use case: illustration-story. Asset type: Afterclass adaptive learning app hero illustration, landscape 3:2. Create a polished editorial paper-cut and fine gouache illustration about turning classroom notes into understanding. An open cream notebook with abstract illegible lines, loose source pages, a pencil, and an elegant flowing forest-green ribbon linking the pages to a small chalkboard with a simple geometric diagram. Restrained tactile paper layers, subtle grain, thoughtful contemporary educational publishing art, sophisticated and welcoming, not childish. Existing app palette: warm paper #fcfaf4, dark blue ink #203a44, forest green #426951, muted ochre accent. Spacious composition with all objects comfortably inside frame, solid warm paper background that blends into #fcfaf4 at edges. No words, letters, logos, UI screenshots, robots, faces, or watermark.

### Ready to study

Use case: illustration-story. Asset type: Afterclass ready-to-study empty-state illustration, square. Create a refined compact editorial paper-cut and fine gouache still life: two neatly stacked cream classroom notebooks, one loose source sheet with abstract illegible lines, a forest-green pencil leaning diagonally, and a small curved leaf-shaped paper bookmark. Communicate a calm fresh start before a lesson. Restrained tactile paper layers, subtle grain, sophisticated educational publishing style. Palette warm paper #fcfaf4, dark blue ink #203a44, forest green #426951, tiny muted ochre accent. Centered small cluster occupying central 65 percent, generous negative space, solid warm paper background blending into #fcfaf4 at all edges. No text, letters, logos, robots, people, UI, or watermark.

### Current app illustrations

Generated September 12, 2026 with the built-in imagegen tool. Each final prompt consists of the shared spec below followed by its asset-specific request. Requested sizes are prompt guidance; the table above records the actual exported dimensions.

#### Shared spec

```text
Use case: illustration-story.
Asset type: production illustration asset for Afterclass, an adaptive tutoring app inside Google Classroom.
Style/medium: sophisticated editorial cut-paper collage with fine gouache, subtle natural paper grain, softly layered edges and very restrained shadows. Calm, warm, patient, contemporary educational publishing; not childish, not glossy 3D.
Color palette: current app colors, near-white paper #f9faf7, dark green ink #263c33, rich forest green #187c55, sage #edf3e9 and a tiny muted ochre #ad762e accent. Cream paper objects and green bindings.
Background: opaque, clean, very pale near-white #f9faf7, uniform near all edges; no vignette, no frame.
Constraints: no words, letters, numbers, pseudo-handwriting, logos, UI screenshots, watermark, people, faces or robots. Abstract horizontal strokes may suggest notes, but no readable text or academic claims. Keep every object fully within frame with generous breathing room. Make a single polished finished illustration, not a collage of variants.
```

#### Catch-up plan

```text
Primary request: A landscape 3:2 illustration for the Catch Up screen, communicating that scattered class materials become a manageable small-step plan.
Subject: A restrained tabletop still life with two loose cream source sheets on the left and a small open green-bound planner in the middle. A single flowing forest-green paper ribbon travels from the source sheets across three broad sage paper stepping stones to a simple small ochre sunrise disk on the right. The open planner has just three short horizontal strokes with small empty square boxes, no writing. A small unnumbered analog clock beside it conveys fitting learning into available time. Quiet botanical leaf-shaped bookmark, very small, as the only organic accent.
Composition: landscape 1536 by 1024 requested, comfortably centered horizontal arrangement occupying about 74 percent of width and 65 percent of height. Clear silhouettes and simple hierarchy, readable as a 480-pixel-wide UI illustration. Warm tactile detail close-up; not a technical flow chart. Large clean margins. No text.
```

#### Whiteboard together

```text
Primary request: A square illustration for the whiteboard introduction, communicating sketching an idea and understanding it together.
Subject: One small gently tilted ivory whiteboard with a slim dark forest-green frame, resting at a three-quarter angle on a compact tabletop base. On its white surface, a clean hand-drawn sage circle and triangle connect with one dark-green curved arrow. One thick forest-green marker lies diagonally in the foreground next to a small cream paper note with two abstract horizontal strokes. A tiny ochre spark consisting of three simple short strokes near the upper corner suggests a moment of clarity. Shapes are decorative, not a mathematical proof.
Composition: square 1024 by 1024 requested, one unified centered cluster occupying central 68 percent, generous uncluttered negative space at every edge, simple graphic silhouettes that work at 280-pixel display size. Same tangible paper-cut and fine gouache craft as a premium illustration of green-bound cream notebooks. No chalkboard, no chalky black background. No text.
```

#### Lesson complete

```text
Primary request: A square illustration for a completed-lesson recap, communicating quiet progress and earned understanding.
Subject: A neatly closed cream notebook with a rich forest-green cloth spine, seen at a gentle three-quarter angle. One cream recap card leans against it, carrying one large simple green check mark and just two abstract horizontal strokes. A green paper ribbon bookmark curls out of the notebook and rises into two small leaf shapes. A small muted ochre sun disk sits just behind the notebook at the upper right, with only three short unobtrusive rays. Tactile page edges and a grounded soft shadow.
Composition: square 1024 by 1024 requested, elegant compact central cluster occupying central 65 percent, ample clean margin on all four sides. Clear silhouette for a small 280-pixel UI state. Quiet satisfaction and a fresh next step. No trophies, medals, graduation hats, confetti, stars, scores, certificates or claims of mastery. No text.
```
