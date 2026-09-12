export type PostType = "courseWork" | "courseWorkMaterials" | "announcements";
export type PostRef = { id: string; type: PostType };
export type ClassroomPost = PostRef & {
  courseId: string;
  title: string;
  description: string;
  state?: string;
  canManage?: boolean;
  topicId?: string;
  dueAt?: string;
  publishedAt?: string;
  alternateLink?: string;
  attachments: { id: string; title: string; mimeType?: string }[];
};
export type ClassroomCourse = {
  id: string;
  name: string;
  section?: string;
  alternateLink?: string;
};
export type ClassroomTopic = { topicId: string; name: string };
export type Passage = {
  id: string;
  text: string;
  page?: number;
  heading?: string;
};
export type StudySource = {
  id: string;
  title: string;
  mimeType: string;
  postIds: string[];
  passages: Passage[];
  originalUrl: string;
  pdfAvailable: boolean;
};
export type SourceFailure = { id: string; title: string; reason: string };
export type Citation = { sourceId: string; passageId: string; quote: string };
export type TeachingAction =
  | "diagnostic"
  | "explain"
  | "reteach"
  | "practice"
  | "teach_back"
  | "recap"
  | "answer";
export type LessonPhase =
  | "ready"
  | "diagnostic"
  | "teaching"
  | "checking"
  | "reteaching"
  | "practice"
  | "teach_back"
  | "complete";
export type BoardItem = {
  id: string;
  kind: "text" | "arrow" | "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
};
export type BoardStroke = { points: { x: number; y: number }[]; color: string };
export type Board = {
  items: BoardItem[];
  strokes: BoardStroke[];
  scene?: {
    elements: Record<string, unknown>[];
    files: Record<string, unknown>;
    sourceItems: BoardItem[];
  };
};
export type Evidence = {
  id: string;
  lessonId: string;
  topic: string;
  answer: string;
  assessment: "correct" | "partial" | "incorrect";
  misconception: string | null;
  intervention: string;
  createdAt: string;
};
export type LearnerProfile = {
  name: string;
  pace: "gentle" | "balanced" | "quick";
  explanation: "examples" | "diagrams" | "words";
  goals: string;
  evidence: Evidence[];
};
export type LessonMessage = {
  id: string;
  role: "student" | "agent";
  text: string;
  action?: TeachingAction;
  citations: Citation[];
  createdAt: string;
};
export type Lesson = {
  id: string;
  courseId: string;
  title: string;
  posts: PostRef[];
  sources: StudySource[];
  failures: SourceFailure[];
  phase: LessonPhase;
  classroomPosts?: ClassroomPost[];
  catchUp?: CatchUpState;
  assignment?: AssignmentState;
  messages: LessonMessage[];
  board: Board;
  evidence: Evidence[];
  createdAt: string;
  updatedAt: string;
  revision: number;
};
export type TurnIntent =
  | "teach"
  | "answer"
  | "question"
  | "simplify"
  | "example"
  | "why"
  | "skip"
  | "recap";
export type TurnInput = {
  intent: TurnIntent;
  catchUpMinutes?: number;
  text: string;
  requestId: string;
  revision: number;
};
export type TutorReply = {
  catchUp?: CatchUpState;
  text: string;
  action: TeachingAction;
  citations: Citation[];
  assessment: "correct" | "partial" | "incorrect" | "none";
  misconception: string | null;
  board: BoardItem[];
};
export type APIError = { error: string; code: string };
// Same API contract in the extension and the browser companion. No Google token enters page DOM.
export type ApiClient = <T>(
  path: string,
  init?: { method?: string; body?: unknown },
) => Promise<T>;

export type CrewNote = { text: string; citations: Citation[] };
export type CatchUpState = {
  minutes: number;
  scout: CrewNote;
  review: (CrewNote & { assessment: TutorReply["assessment"]; prerequisite: string | null }) | null;
  plan: { reason: string; steps: (CrewNote & { minutes: number })[] };
};

export type AssignmentRequirement = { id: string; text: string; citations: Citation[] };
export type AssignmentReview = {
  summary: string;
  criteria: { requirementId: string; status: "addressed" | "partial" | "missing" | "unclear"; feedback: string; draftQuote: string; citations: Citation[] }[];
  nextAction: string;
};
export type AssignmentState = {
  assignmentId: string;
  goal: string;
  requirements: AssignmentRequirement[];
  requirementsStale?: boolean;
  rubricAvailable: boolean;
  materials: { sourceId: string; reason: string }[];
  blocker: string | null;
  nextAction: string;
  draft: string;
  help: { text: string; citations: Citation[] } | null;
  review: AssignmentReview | null;
  updatedAt: string;
};
export type AssignmentInput = {
  action: "prepare" | "save" | "help" | "review";
  assignmentId?: string;
  draft?: string;
  question?: string;
  revision: number;
  requestId: string;
};
