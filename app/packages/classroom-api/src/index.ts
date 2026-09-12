export const classroomScopes = {
  student: [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/classroom.addons.student",
    "https://www.googleapis.com/auth/classroom.courses.readonly",
    "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
    "https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly",
    "https://www.googleapis.com/auth/classroom.announcements.readonly",
    "https://www.googleapis.com/auth/classroom.student-submissions.me.readonly",
  ],
  teacher: [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/classroom.addons.teacher",
    "https://www.googleapis.com/auth/classroom.courses.readonly",
    "https://www.googleapis.com/auth/classroom.coursework.students.readonly",
    "https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly",
    "https://www.googleapis.com/auth/classroom.announcements.readonly",
    "https://www.googleapis.com/auth/classroom.rosters.readonly",
  ],
} as const;

export type AddOnQuery = {
  courseId: string;
  itemId: string;
  itemType: "courseWork" | "courseWorkMaterials" | "announcements";
  attachmentId?: string;
  submissionId?: string;
  addOnToken?: string;
  login_hint?: string;
  urlToUpgrade?: string;
};

export const addonRoutes = {
  discovery: "/addon/discovery",
  student: "/addon/student",
  teacher: "/addon/teacher",
  review: "/addon/review",
  upgrade: "/addon/upgrade",
} as const;
