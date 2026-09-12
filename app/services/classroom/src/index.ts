import type {
  ClassroomCourse,
  ClassroomPost,
  ClassroomTopic,
  PostRef,
  PostType,
  StudySource,
  SourceFailure,
  Passage,
} from "../../../packages/shared-types/src/study";

const CLASSROOM = "https://classroom.googleapis.com/v1";
const DRIVE = "https://www.googleapis.com/drive/v3/files";
const DOC = "application/vnd.google-apps.document";
const PDF = "application/pdf";
const TYPES: PostType[] = [
  "courseWork",
  "courseWorkMaterials",
  "announcements",
];
const MAX_BYTES = 15 * 1024 * 1024;
const id = (value: string) => {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(value))
    throw new Error("Invalid Google resource ID");
  return value;
};
type GoogleObject = Record<string, any>;

export class GoogleError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "GoogleError";
  }
}

export class GoogleClassroom {
  constructor(
    private token: string,
    private fetcher: typeof fetch = fetch,
  ) {}

  private async bytes(url: string): Promise<Uint8Array> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        headers: { Authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(20_000),
        redirect: "error",
      });
    } catch {
      throw new Error("Google request timed out or could not connect");
    }
    if (response.status === 403) {
      const body = await response.json().catch(() => null);
      const error = body?.error;
      const reasons = [
        ...(Array.isArray(error?.details) ? error.details : []),
        ...(Array.isArray(error?.errors) ? error.errors : []),
      ].map((detail) => detail?.reason);
      let message = "Google denied access to this resource";
      if (reasons.some((r) => ["ACCESS_TOKEN_SCOPE_INSUFFICIENT", "insufficientPermissions"].includes(r)))
        message = "Google authorization is missing a required permission. Disconnect Google in extension settings, then reconnect and approve the requested permissions.";
      else if (reasons.some((r) => ["SERVICE_DISABLED", "accessNotConfigured"].includes(r))) {
        const service = new URL(url).hostname === "classroom.googleapis.com"
          ? "Google Classroom API" : new URL(url).hostname === "docs.googleapis.com"
            ? "Google Docs API" : "Google Drive API";
        message = `Enable the ${service} in the Google Cloud project used by this extension's OAuth client, then retry.`;
      } else if (reasons.some((r) => ["DOMAIN_POLICY", "domainPolicy"].includes(r)))
        message = "Your school administrator has restricted this app's access. Ask them to allow the app and its requested Google permissions.";
      else if (new URL(url).hostname === "classroom.googleapis.com" && /\/courseWork(?:\/|$)/.test(new URL(url).pathname))
        message += ". Check that the connected Google account is enrolled as a student in this class. This extension requests student coursework access; a teacher account needs teacher coursework permission. School policy may also restrict access.";
      throw new GoogleError(message, response.status);
    }
    if (!response.ok)
      throw new GoogleError(
        response.status === 401
          ? "Google authorization expired; reconnect your account"
          : response.status === 404
              ? "Google resource is unavailable"
              : `Google request failed (${response.status})`,
        response.status,
      );
    if (Number(response.headers.get("content-length")) > MAX_BYTES) {
      await response.body?.cancel();
      throw new Error("File exceeds 15 MB limit");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Google returned an empty response");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BYTES) {
          await reader.cancel();
          throw new Error("File exceeds 15 MB limit");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
  private async json(url: string): Promise<GoogleObject> {
    return JSON.parse(new TextDecoder().decode(await this.bytes(url)));
  }

  async authenticate(
    expectedClientIds: string[],
  ): Promise<{ id: string; email: string; name: string }> {
    if (!expectedClientIds.length)
      throw new Error("Google OAuth client IDs are not configured");
    const info = await this.json(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(this.token)}`,
    );
    const audience = info.aud ?? info.audience ?? info.issued_to;
    if (
      !expectedClientIds.includes(audience) ||
      !Number.isFinite(Number(info.expires_in)) ||
      Number(info.expires_in) <= 0
    )
      throw new Error("Google token audience or expiry is invalid");
    const profile = await this.json(
      "https://openidconnect.googleapis.com/v1/userinfo",
    );
    if (
      !profile.sub ||
      !profile.email ||
      profile.email_verified !== true ||
      (info.sub && info.sub !== profile.sub)
    )
      throw new Error("Google account could not be verified");
    return {
      id: profile.sub,
      email: profile.email,
      name: profile.name || profile.email,
    };
  }
  private async list(url: string, key: string): Promise<GoogleObject[]> {
    const rows: GoogleObject[] = [];
    let pageToken = "";
    const seen = new Set<string>();
    do {
      const page = new URL(url);
      page.searchParams.set("pageSize", "100");
      if (pageToken) page.searchParams.set("pageToken", pageToken);
      const data = await this.json(page.href);
      rows.push(...(data[key] ?? []));
      pageToken = data.nextPageToken || "";
      if (pageToken && (seen.has(pageToken) || seen.size >= 100))
        throw new Error(
          "Google pagination limit reached; narrow the class selection",
        );
      seen.add(pageToken);
    } while (pageToken);
    return rows;
  }
  async courses(): Promise<ClassroomCourse[]> {
    return (
      await this.list(`${CLASSROOM}/courses?courseStates=ACTIVE`, "courses")
    ).map((c) => ({
      id: c.id,
      name: c.name,
      section: c.section,
      alternateLink: c.alternateLink,
    }));
  }
  private post(
    courseId: string,
    type: PostType,
    raw: GoogleObject,
  ): ClassroomPost {
    return {
      id: raw.id,
      type,
      courseId,
      title:
        raw.title ||
        raw.text?.split("\n")[0]?.slice(0, 120) ||
        "Class announcement",
      description: raw.description || raw.text || "",
      topicId: raw.topicId,
      publishedAt: raw.creationTime,
      ...(raw.dueDate ? { dueAt: new Date(Date.UTC(raw.dueDate.year, raw.dueDate.month - 1, raw.dueDate.day, raw.dueTime?.hours || 0, raw.dueTime?.minutes || 0, raw.dueTime?.seconds || 0)).toISOString() } : {}),
      alternateLink: raw.alternateLink,
      attachments: (raw.materials ?? []).flatMap((m: GoogleObject) =>
        m.driveFile?.driveFile?.id
          ? [
              {
                id: m.driveFile.driveFile.id,
                title: m.driveFile.driveFile.title || "Class document",
              },
            ]
          : [],
      ),
    };
  }
  async posts(
    courseId: string,
  ): Promise<{
    posts: ClassroomPost[];
    topics: ClassroomTopic[];
    warnings: string[];
  }> {
    id(courseId);
    // Verify the class independently so a denied class is not presented as an empty class.
    await this.json(`${CLASSROOM}/courses/${courseId}`);
    const warnings: string[] = [];
    const posts: ClassroomPost[] = [];
    let topics: ClassroomTopic[] = [];
    const results = await Promise.allSettled([
      ...TYPES.map((t) =>
        this.list(`${CLASSROOM}/courses/${courseId}/${t}`, t),
      ),
      this.list(`${CLASSROOM}/courses/${courseId}/topics`, "topic"),
    ]);
    results.forEach((r, i) => {
      if (r.status === "rejected")
        warnings.push(`${TYPES[i] || "topics"}: ${r.reason.message}`);
      else if (i < TYPES.length)
        posts.push(...r.value.map((p) => this.post(courseId, TYPES[i]!, p)));
      else topics = r.value.map((t) => ({ topicId: t.topicId, name: t.name }));
    });
    return { posts, topics, warnings };
  }
  private async selected(
    courseId: string,
    refs: PostRef[],
  ): Promise<ClassroomPost[]> {
    id(courseId);
    if (!Array.isArray(refs) || refs.length < 1 || refs.length > 30)
      throw new Error("Select between 1 and 30 posts");
    const unique = new Map<string, PostRef>();
    for (const ref of refs) {
      if (!ref || !TYPES.includes(ref.type))
        throw new Error("Invalid Classroom post type");
      id(ref.id);
      unique.set(`${ref.type}:${ref.id}`, ref);
    }
    const result: ClassroomPost[] = [];
    for (const ref of unique.values()) {
      const raw = await this.json(
        `${CLASSROOM}/courses/${courseId}/${ref.type}/${ref.id}`,
      );
      if (raw.id !== ref.id || (raw.courseId && raw.courseId !== courseId))
        throw new Error("Classroom post does not belong to the selected class");
      result.push(this.post(courseId, ref.type, raw));
    }
    return result;
  }
  private async metadata(fileId: string): Promise<GoogleObject> {
    const meta = await this.json(
      `${DRIVE}/${id(fileId)}?fields=id,name,mimeType,size,capabilities(canDownload)&supportsAllDrives=true`,
    );
    if (![DOC, PDF].includes(meta.mimeType))
      throw new Error("Only Google Docs and PDF attachments are supported");
    if (Number(meta.size) > MAX_BYTES)
      throw new Error("File exceeds 15 MB limit");
    return meta;
  }
  private async download(
    fileId: string,
    meta: GoogleObject,
  ): Promise<Uint8Array> {
    if (meta.capabilities?.canDownload === false)
      throw new Error("The owner has disabled downloading this document");
    return this.bytes(
      meta.mimeType === DOC
        ? `${DRIVE}/${id(fileId)}/export?mimeType=application%2Fpdf`
        : `${DRIVE}/${id(fileId)}?alt=media&supportsAllDrives=true`,
    );
  }
  async pdf(
    courseId: string,
    refs: PostRef[],
    fileId: string,
  ): Promise<Uint8Array> {
    id(fileId);
    const posts = await this.selected(courseId, refs);
    if (!posts.some((p) => p.attachments.some((a) => a.id === fileId)))
      throw new Error("File is not attached to the selected Classroom posts");
    return this.download(fileId, await this.metadata(fileId));
  }
  async loadSources(
    courseId: string,
    refs: PostRef[],
  ): Promise<{
    sources: StudySource[];
    failures: SourceFailure[];
    posts: ClassroomPost[];
  }> {
    const posts = await this.selected(courseId, refs);
    const sources: StudySource[] = [];
    const failures: SourceFailure[] = [];
    const attachments = new Map<string, { title: string; postIds: string[] }>();
    for (const post of posts)
      for (const a of post.attachments) {
        const item = attachments.get(a.id);
        if (item) {
          if (!item.postIds.includes(post.id)) item.postIds.push(post.id);
        } else attachments.set(a.id, { title: a.title, postIds: [post.id] });
      }
    if (attachments.size > 40)
      throw new Error("Select fewer posts: at most 40 attachments per lesson");
    let total = 0;
    for (const [fileId, attachment] of attachments) {
      try {
        const meta = await this.metadata(fileId);
        let passages: Passage[];
        if (meta.mimeType === DOC)
          passages = documentPassages(
            await this.json(
              `https://docs.googleapis.com/v1/documents/${id(fileId)}?includeTabsContent=true`,
            ),
          );
        else passages = await pdfPassages(await this.download(fileId, meta));
        const size = passages.reduce((n, p) => n + p.text.length, 0);
        if (!size)
          throw new Error(
            "No readable text found. Scanned PDFs require a text layer",
          );
        if (size > 250_000 || total + size > 600_000)
          throw new Error(
            "Document exceeds lesson text limit; select a shorter document",
          );
        total += size;
        sources.push({
          id: fileId,
          title: meta.name || attachment.title,
          mimeType: meta.mimeType,
          postIds: attachment.postIds,
          passages,
          originalUrl:
            meta.mimeType === DOC
              ? `https://docs.google.com/document/d/${fileId}/edit`
              : `https://drive.google.com/file/d/${fileId}/view`,
          pdfAvailable: meta.capabilities?.canDownload !== false,
        });
      } catch (error) {
        if (error instanceof GoogleError && error.status === 401) throw error;
        failures.push({
          id: fileId,
          title: attachment.title,
          reason:
            error instanceof Error
              ? error.message
              : "Unable to read attachment",
        });
      }
    }
    return { sources, failures, posts };
  }
}

export function documentPassages(document: GoogleObject): Passage[] {
  const passages: Passage[] = [];
  const content = (
    elements: GoogleObject[],
    prefix: string,
    heading?: string,
  ) => {
    for (const [i, element] of elements.entries()) {
      const key = `${prefix}-${element.startIndex ?? i}`;
      if (element.paragraph) {
        const text = (element.paragraph.elements ?? [])
          .map((e: GoogleObject) => e.textRun?.content || "")
          .join("")
          .trim();
        if (text) passages.push(...splitPassage({ id: key, text, heading }));
      }
      for (const [row, r] of (element.table?.tableRows ?? []).entries())
        for (const [cell, c] of (r.tableCells ?? []).entries())
          content(c.content || [], `${key}-r${row}c${cell}`, heading);
      if (element.tableOfContents)
        content(element.tableOfContents.content || [], `${key}-toc`, heading);
    }
  };
  const tabs = (items: GoogleObject[]) => {
    for (const tab of items) {
      content(
        tab.documentTab?.body?.content || [],
        `tab-${tab.tabProperties?.tabId || "main"}`,
        tab.tabProperties?.title,
      );
      tabs(tab.childTabs || []);
    }
  };
  if (document.tabs?.length) tabs(document.tabs);
  else content(document.body?.content || [], "body");
  return passages;
}

async function pdfPassages(bytes: Uint8Array): Promise<Passage[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: bytes, useSystemFonts: true });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 150) throw new Error("PDF exceeds 150 page limit");
    const passages: Passage[] = [];
    for (let page = 1; page <= pdf.numPages; page++) {
      const text = await (await pdf.getPage(page)).getTextContent();
      const value = text.items
        .map((item) =>
          "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
        )
        .join("")
        .trim();
      if (value)
        passages.push(
          ...splitPassage({ id: `page-${page}`, page, text: value }),
        );
    }
    return passages;
  } finally {
    await task.destroy();
  }
}

function splitPassage(passage: Passage): Passage[] {
  if (passage.text.length <= 2000) return [passage];
  const chunks: Passage[] = [];
  let remaining = passage.text;
  while (remaining.length) {
    let end = Math.min(2000, remaining.length);
    if (end < remaining.length) {
      const space = remaining.lastIndexOf(" ", end);
      if (space > 1000) end = space;
    }
    chunks.push({
      ...passage,
      id: `${passage.id}-part-${chunks.length + 1}`,
      text: remaining.slice(0, end).trim(),
    });
    remaining = remaining.slice(end).trim();
  }
  return chunks;
}
