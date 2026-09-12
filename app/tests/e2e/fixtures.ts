import type {
  ClassroomPost,
  LearnerProfile,
  Lesson,
  BoardItem,
} from "../../packages/shared-types/src/study";

// Browser-only fixtures: production always retrieves authorized Classroom sources.
export const posts: ClassroomPost[] = [
  {
    id: "post-a",
    type: "courseWorkMaterials",
    courseId: "course-1",
    title: "Light and leaves",
    description: "Teacher notes",
    topicId: "topic-1",
    attachments: [{ id: "source-a", title: "Light notes" }],
  },
  {
    id: "post-b",
    type: "courseWorkMaterials",
    courseId: "course-1",
    title: "Making glucose",
    description: "Teacher diagram",
    topicId: "topic-1",
    attachments: [
      { id: "source-a", title: "Light notes" },
      { id: "source-b", title: "Glucose diagram" },
    ],
  },
];
export const profile: LearnerProfile = {
  name: "Alex",
  pace: "balanced",
  explanation: "examples",
  goals: "Understand photosynthesis",
  evidence: [],
};
export function lessonFixture(): Lesson {
  return {
    id: "lesson-1",
    courseId: "course-1",
    title: "Photosynthesis",
    posts: posts.map(({ id, type }) => ({ id, type })),
    sources: [
      {
        id: "source-a",
        title: "Light notes",
        mimeType: "application/vnd.google-apps.document",
        postIds: ["post-a", "post-b"],
        originalUrl: "https://docs.google.com/document/d/source-a/edit",
        pdfAvailable: false,
        passages: [
          {
            id: "passage-a",
            text: "Sunlight supplies energy for photosynthesis.",
          },
          {
            id: "passage-a2",
            text: "Chlorophyll absorbs the light in chloroplasts.",
          },
        ],
      },
      {
        id: "source-b",
        title: "Glucose diagram",
        mimeType: "application/vnd.google-apps.document",
        postIds: ["post-b"],
        originalUrl: "https://docs.google.com/document/d/source-b/edit",
        pdfAvailable: false,
        passages: [
          {
            id: "passage-b",
            text: "Plants use light energy to make glucose from carbon dioxide and water.",
          },
        ],
      },
    ],
    failures: [],
    phase: "ready",
    messages: [],
    board: { items: [], strokes: [] },
    evidence: [],
    createdAt: "2026-09-12T04:00:00Z",
    updatedAt: "2026-09-12T04:00:00Z",
    revision: 0,
  };
}

// Synthetic source material for force-diagram checks; never loaded by production.
export function physicsLessonFixture(): Lesson {
  const lesson = lessonFixture();
  return { ...lesson, title: "Forces and motion", sources: [{ ...lesson.sources[0], title: "Forces notes", passages: [
    { id: "forces", text: "The resultant force is the vector sum of external forces: F_net = ma. A car's driven tyres push the road backward and the road exerts forward traction on the tyres. Air resistance and rolling resistance oppose motion. On a level road with no vertical acceleration, the upward normal reaction equals downward weight mg. For a car travelling right, F_net = traction - resistance. It accelerates right when traction exceeds resistance, moves at constant velocity when they balance (resultant 0 N), and slows down when resistance exceeds traction. Motion alone does not imply a nonzero resultant." },
    { id: "falling", text: "An apple hanging at rest has downward weight balanced by upward stem support. After detaching, stem support disappears but gravity continues to act downward. Neglecting air resistance, the falling apple has only weight mg acting on it, so its resultant is mg downward and acceleration is g, approximately 9.8 m/s² near Earth's surface. There is no normal reaction while it is falling. If air resistance is included, drag opposes downward motion and the downward resultant is mg minus drag. At release from rest drag is zero; at terminal velocity drag equals weight and the resultant is zero." },
  ] }] };
}

const part = (id: string, kind: BoardItem["kind"], x: number, y: number, width: number, height: number, text = ""): BoardItem =>
  ({ id, kind, x, y, width, height, text });
export const physicsScenarios = [
  { name: "car", question: "How does a car move? What's the resultant forces acting on it?",
    text: "Tutor-generated: the car speeds up to the right. The road pushes the driven tyres forward. Weight and normal reaction balance vertically. F_net = traction - resistance = ma. At constant velocity the resultant is 0 N; when resistance is larger the car slows down. Which forces balance vertically?",
    board: [
      part("title", "text", 20, 10, 340, 0, "Car: speeding up right\nTutor-generated example"),
      part("road", "line", 40, 295, 720, 0),
      part("body", "rectangle", 320, 210, 200, 60, "Car"),
      part("roof", "rectangle", 365, 168, 110, 42),
      part("wheel-left", "ellipse", 350, 255, 36, 36),
      part("wheel-right", "ellipse", 450, 255, 36, 36),
      part("normal", "arrow", 420, 150, 0, -100),
      part("normal-label", "text", 440, 80, 230, 0, "Normal reaction N"),
      part("weight", "arrow", 420, 305, 0, 100, "Weight"),
      part("weight-label", "text", 445, 345, 220, 0, "Weight mg"),
      part("traction", "arrow", 535, 235, 170, 0, "Traction"),
      part("resistance", "arrow", 305, 235, -110, 0, "Resistance"),
      part("resultant", "text", 20, 465, 350, 0, "F_net = traction − resistance = ma\nAt constant velocity: 0 N"),
      part("vertical", "text", 440, 465, 260, 0, "Vertically: N = mg"),
    ],
  },
  { name: "apple", question: "How does an apple drop from a tree? What forces act on it?",
    text: "The drawing shows the apple after release. The stem no longer supports it; gravity was already acting before release. Neglecting air resistance, weight mg is the only force, so F_net = mg downward and a = g ≈ 9.8 m/s². If included, air resistance acts upward while it falls. What changes when the stem releases the apple?",
    board: [
      part("title", "text", 470, 30, 260, 0, "Apple after release"),
      part("trunk", "rectangle", 155, 145, 26, 290, "Tree trunk"),
      part("canopy", "ellipse", 70, 30, 230, 120),
      part("branch", "line", 168, 145, 132, -15),
      part("apple", "ellipse", 285, 210, 30, 36, "Apple"),
      part("weight", "arrow", 300, 258, 0, 120),
      part("weight-label", "text", 330, 295, 200, 0, "Weight mg"),
      part("ground", "line", 660, 435, -660, 0, "Ground"),
      part("resultant", "text", 20, 475, 350, 0, "Air resistance neglected\nF_net = mg ↓; a = g ≈ 9.8 m/s²"),
      part("support", "text", 470, 120, 260, 0, "No stem support\nafter release"),
    ],
  },
] as const;
