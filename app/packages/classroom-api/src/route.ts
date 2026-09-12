/** Classroom encodes numeric ids as base64url path segments. Decode when possible, else keep the raw segment. */
function decodeRef(ref: string): string {
  try {
    const decoded = atob(ref.replace(/-/g, '+').replace(/_/g, '/'));
    if (/^[A-Za-z0-9_-]+$/.test(decoded)) return decoded;
  } catch {}
  return ref;
}
function classroomPath(value: string | undefined): string | undefined {
  if (!value) return;
  let url: URL;
  try { url = new URL(value, 'https://classroom.google.com'); } catch { return; }
  if (url.origin !== 'https://classroom.google.com') return;
  return url.pathname;
}
/** Classroom uses c for Stream, w for Classwork, and r for People. */
export function classroomCourseRef(value: string | undefined): string | undefined {
  const ref = classroomPath(value)?.match(/^\/(?:u\/\d+\/)?(?:c|w|r)\/([^/]+)/)?.[1];
  return ref ? decodeRef(ref) : undefined;
}
/** Post routes under a class: a = assignment, m = material, p = announcement, sa/mc/qa = questions. */
export function classroomPostRef(
  value: string | undefined,
): { courseRef: string; kind: string; postRef: string } | undefined {
  const match = classroomPath(value)?.match(
    /^\/(?:u\/\d+\/)?(?:c|w|r)\/([^/]+)\/(a|m|p|sa|mc|qa)\/([^/]+)/,
  );
  if (!match) return;
  return { courseRef: decodeRef(match[1]!), kind: match[2]!, postRef: decodeRef(match[3]!) };
}
