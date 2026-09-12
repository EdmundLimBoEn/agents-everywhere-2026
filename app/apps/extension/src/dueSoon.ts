import type {
  ClassroomCourse,
  ClassroomPost,
} from "../../../packages/shared-types/src/study";

export const DUE_SOON_WINDOW_MS = 48 * 60 * 60 * 1000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Assignments with a Classroom-supplied deadline inside the window, soonest first. Overdue work stays Classroom's to show. */
export function dueSoon(
  posts: ClassroomPost[],
  now = Date.now(),
  windowMs = DUE_SOON_WINDOW_MS,
): ClassroomPost[] {
  return posts
    .filter((post) => post.type === "courseWork" && post.dueAt !== undefined)
    .map((post) => ({ post, due: Date.parse(post.dueAt!) }))
    .filter(({ due }) => Number.isFinite(due) && due > now && due <= now + windowMs)
    .sort((a, b) => a.due - b.due)
    .map(({ post }) => post);
}

export function badgeText(count: number): string {
  if (!Number.isSafeInteger(count) || count <= 0) return "";
  return count > 9 ? "9+" : String(count);
}

export function badgeTitle(count: number): string {
  if (!Number.isSafeInteger(count) || count <= 0)
    return "Study your Classroom notes";
  return count === 1
    ? "1 assignment due within 48 hours"
    : `${count} assignments due within 48 hours`;
}

export function dueLabel(dueAt: string, now = Date.now()): string {
  const due = Date.parse(dueAt);
  if (!Number.isFinite(due)) return "Due date unavailable";
  const remaining = due - now;
  if (remaining <= HOUR) return "Due within the hour";
  if (remaining < DAY) return `Due in ${Math.round(remaining / HOUR)} hours`;
  const today = new Date(now);
  const dueDate = new Date(due);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfDue = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime();
  if (Math.round((startOfDue - startOfToday) / DAY) === 1) return "Due tomorrow";
  return `Due ${dueDate.toLocaleDateString(undefined, { weekday: "short" })}`;
}

/** One announcement per deadline: a moved due date is news again. */
export const notificationKey = (post: ClassroomPost) =>
  `${post.courseId}:${post.id}:${post.dueAt}`;

export function notificationCopy(
  post: ClassroomPost,
  course: ClassroomCourse | undefined,
  now = Date.now(),
): { title: string; message: string } {
  const notes = post.attachments.length;
  const context = [
    course?.name,
    notes ? `${notes} attached ${notes === 1 ? "note" : "notes"}` : "no attachments yet",
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    title: `${dueLabel(post.dueAt!, now)} · ${post.title}`.slice(0, 120),
    message: `${context}. Open it in Classroom to catch up with your teacher's notes.`,
  };
}

/** Only Classroom pages may open from a notification. */
export function classroomLink(url: unknown): string {
  try {
    const parsed = new URL(String(url));
    if (parsed.protocol === "https:" && parsed.hostname === "classroom.google.com")
      return parsed.href;
  } catch {
    /* fall through to the Classroom home */
  }
  return "https://classroom.google.com/";
}

/** Due-soon assignments not yet announced for their current deadline. */
export function pendingNotifications(
  posts: ClassroomPost[],
  notified: Iterable<string>,
): ClassroomPost[] {
  const seen = new Set(notified);
  return posts.filter((post) => !seen.has(notificationKey(post)));
}
