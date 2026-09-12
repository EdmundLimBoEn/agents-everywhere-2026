/** Validate before attaching a Google token to a backend request. */
export function allowedPath(path: unknown): path is string {
  if (
    typeof path !== "string" ||
    !path.startsWith("/api/") ||
    path.includes("#")
  )
    return false;
  const [pathname] = path.split("?");
  if (!/^\/api\/[a-zA-Z0-9_/%:-]+$/.test(pathname) || pathname.includes("//"))
    return false;
  try {
    const decoded = decodeURIComponent(pathname);
    if (
      decoded.includes("..") ||
      decoded.includes("\\") ||
      decoded.includes("//") ||
      !/^\/api\/[a-zA-Z0-9_/:-]+$/.test(decoded)
    )
      return false;
    const url = new URL(path, "https://backend.invalid");
    if (url.origin !== "https://backend.invalid" || url.pathname !== pathname)
      return false;
    return (
      [...url.searchParams].every(
        ([key, value]) => key === "courseId" && /^[a-zA-Z0-9_-]+$/.test(value),
      ) && url.searchParams.getAll("courseId").length <= 1
    );
  } catch {
    return false;
  }
}
export const allowedMethods = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

export async function readApiResponse(
  response: Response,
): Promise<{ status: number; body: any }> {
  if (!response.headers.get("content-type")?.includes("application/x-ndjson")) {
    return { status: response.status, body: await response.json() };
  }
  if (!response.body)
    throw new Error("The server returned an empty response. Please retry.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let lastLine = "";
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (value) bytes += value.byteLength;
      if (bytes > 32 * 1024 * 1024)
        throw new Error("The server response exceeds the supported size.");
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split("\n");
      pending = lines.pop()!;
      for (const line of lines) if (line.trim()) lastLine = line;
      if (done) break;
    }
    if (pending.trim()) lastLine = pending;
    const result = JSON.parse(lastLine);
    if (
      !result ||
      !Number.isInteger(result.status) ||
      result.status < 100 ||
      result.status > 599 ||
      !Object.hasOwn(result, "body")
    ) {
      throw new Error(
        "The server disconnected before finishing. Please retry.",
      );
    }
    return result;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
