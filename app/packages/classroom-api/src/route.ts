/** Classroom uses c for Stream, w for Classwork, and r for People. */
export function classroomCourseRef(value: string | undefined): string | undefined {
  if (!value) return;
  let url: URL;
  try { url = new URL(value, 'https://classroom.google.com'); } catch { return; }
  if (url.origin !== 'https://classroom.google.com') return;
  const ref = url.pathname.match(/^\/(?:u\/\d+\/)?(?:c|w|r)\/([^/]+)/)?.[1];
  if (!ref) return;
  try {
    const decoded = atob(ref.replace(/-/g, '+').replace(/_/g, '/'));
    if (/^[A-Za-z0-9_-]+$/.test(decoded)) return decoded;
  } catch {}
  return ref;
}
