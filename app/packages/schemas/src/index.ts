export type ClassroomItemType =
  | "courseWork"
  | "courseWorkMaterials"
  | "announcements";

export type ClassroomRole = "student" | "teacher";

export type SubmissionState =
  | "NEW"
  | "CREATED"
  | "TURNED_IN"
  | "RETURNED"
  | "RECLAIMED_BY_STUDENT";

export type LessonMode = "learning" | "exam";

export type AnswerOutcome =
  | "correct_confident"
  | "correct_unsure"
  | "wrong_confident"
  | "wrong_unsure";

export type LessonState =
  | "IDLE"
  | "GOAL_SELECTION"
  | "ASSESS_PRIOR_KNOWLEDGE"
  | "TEACH"
  | "CHECK_UNDERSTANDING"
  | "DIAGNOSE"
  | "RETEACH"
  | "PRACTICE"
  | "ASSESS"
  | "UPDATE_MASTERY"
  | "SUMMARY"
  | "COMPLETE";

export type Course = {
  courseId: string;
  name: string;
  section?: string;
};

export type CourseWorkItem = {
  courseId: string;
  itemId: string;
  itemType: ClassroomItemType;
  title: string;
  description?: string;
  dueDate?: string;
  maxPoints?: number;
  topicId?: string;
  addOnAttachmentId?: string;
};

export type Submission = {
  courseId: string;
  itemId: string;
  submissionId: string;
  state: SubmissionState;
  assignedGrade?: number;
  draftGrade?: number;
  addOnPointsEarned?: number;
};

export type NoteLink = {
  path: string;
  courseId: string;
  itemType: ClassroomItemType;
  itemId: string;
  driveFileId?: string;
  topic: string;
};

export type Lesson = {
  courseId: string;
  itemId: string;
  itemType: ClassroomItemType;
  attachmentId: string;
  submissionId?: string;
  studentIds: string[];
  mode: LessonMode;
  goal: string;
  state: LessonState;
  whiteboardId?: string;
};

export type Mastery = {
  topic: string;
  score: number;
  confidence: number;
  evidence: string;
  lastTested?: string;
  decay: number;
  attempts: number;
  hintsUsed: number;
};

export type MemoryFact = {
  type: "misconception" | "preference" | "goal" | "success";
  topic: string;
  value: string;
  evidenceMessageId?: string;
  confidence: number;
};

export type RetrievalHit = {
  id: string;
  text: string;
  document: string;
  page?: number;
  subject?: string;
  topic?: string;
  subtopic?: string;
  sourceType: "notes_pdf" | "classroom_material" | "practice_paper";
  courseId?: string;
  itemId?: string;
  relevance: number;
};

export type MarkResult = {
  score: number;
  maxScore: number;
  correctness: AnswerOutcome;
  missingPoints: string[];
  misconception?: string;
  feedback: string;
  suggestedNextAction: string;
};
