import type {
  ClassroomPost,
  LearnerProfile,
  Lesson,
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
