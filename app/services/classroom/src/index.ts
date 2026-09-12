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
const EXPORTABLE = [DOC, "application/vnd.google-apps.spreadsheet", "application/vnd.google-apps.presentation", "application/vnd.google-apps.drawing"];
const FILE_TYPES = new Set([PDF, ...EXPORTABLE, "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/vnd.oasis.opendocument.text", "application/rtf", "text/plain", "text/markdown", "text/csv", "text/tab-separated-values", "image/png", "image/jpeg", "image/webp"]);
export type FileReader = (bytes: Uint8Array, mimeType: string, name: string) => Promise<Passage[]>;
// Only extract IDs from known Google links; never follow arbitrary URLs with a Google token.
export function driveLink(value: string): string | undefined {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.port || u.username || u.password) return;
    const match = u.hostname === "docs.google.com"
      ? u.pathname.match(/^\/(?:document|spreadsheets|presentation)\/d\/([\w-]+)(?:\/|$)/)
      : u.hostname === "drive.google.com" ? u.pathname.match(/^\/file\/d\/([\w-]+)(?:\/|$)/) : null;
    const fileId = match?.[1] || (u.hostname === "drive.google.com" && u.pathname === "/open" ? u.searchParams.get("id") : undefined);
    return fileId && /^[\w-]{1,200}$/.test(fileId) ? fileId : undefined;
  } catch { return; }
}
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
    private readFile?: FileReader,
  ) {}

  private async bytes(url: string, init: RequestInit = {}): Promise<Uint8Array> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        ...init,
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", ...init.headers },
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
    if (response.status === 204) return new Uint8Array();
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
  private async json(url: string, init: RequestInit = {}): Promise<GoogleObject> {
    const bytes = await this.bytes(url, init);
    return bytes.length ? JSON.parse(new TextDecoder().decode(bytes)) : {};
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
      state: raw.state,
      canManage: raw.associatedWithDeveloper === true,
      topicId: raw.topicId,
      publishedAt: raw.creationTime,
      ...(raw.dueDate ? { dueAt: new Date(Date.UTC(raw.dueDate.year, raw.dueDate.month - 1, raw.dueDate.day, raw.dueTime?.hours || 0, raw.dueTime?.minutes || 0, raw.dueTime?.seconds || 0)).toISOString() } : {}),
      alternateLink: raw.alternateLink,
      attachments: [...(raw.materials ?? []), ...(String(raw.description || raw.text || "").match(/https:\/\/[^\s<>"”]+/g) || []).map(url => ({ link: { url, title: "Linked Drive document" } }))].flatMap((m: GoogleObject) =>
        m.driveFile?.driveFile?.id
          ? [
              {
                id: m.driveFile.driveFile.id,
                title: m.driveFile.driveFile.title || "Class document",
              },
            ]
          : driveLink(m.link?.url || "") ? [{ id: driveLink(m.link.url)!, title: m.link.title || "Linked Drive document" }] : [],
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
    if (!FILE_TYPES.has(meta.mimeType))
      throw new Error(`Unsupported file type: ${meta.mimeType}. Use Docs, Sheets, Slides, PDF, Word, Excel, PowerPoint, text, CSV, or an image.`);
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
      EXPORTABLE.includes(meta.mimeType)
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
    const meta = await this.metadata(fileId);
    if (meta.mimeType !== PDF && !EXPORTABLE.includes(meta.mimeType)) throw new Error("This file has no PDF preview; open the original instead");
    return this.download(fileId, meta);
  }
  async files(query = "") {
    const q = `trashed = false${query ? ` and name contains '${query.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'` : ""}`;
    return this.list(`${DRIVE}?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name,mimeType,webViewLink)&supportsAllDrives=true&includeItemsFromAllDrives=true`, "files");
  }
  async document(fileId: string) {
    return this.json(`https://docs.googleapis.com/v1/documents/${id(fileId)}?includeTabsContent=true`);
  }
  async createDocument(title: string, text: string) {
    // Drive import creates a populated Google Doc in one request, avoiding an orphan empty document.
    const boundary = `afterclass_${crypto.randomUUID()}`;
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: title, mimeType: DOC })}\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${text}\r\n--${boundary}--`;
    return this.json("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body });
  }
  async updateDocument(fileId: string, operation: { name?: string; append?: string; revisionId?: string; tabId?: string; trashed?: boolean }) {
    if (operation.append !== undefined) {
      return this.json(`https://docs.googleapis.com/v1/documents/${id(fileId)}:batchUpdate`, { method: "POST", body: JSON.stringify({
        writeControl: { requiredRevisionId: operation.revisionId },
        requests: [{ insertText: { endOfSegmentLocation: operation.tabId ? { tabId: operation.tabId } : {}, text: operation.append } }],
      }) });
    }
    return this.json(`${DRIVE}/${id(fileId)}?supportsAllDrives=true&fields=id,name,trashed,webViewLink`, { method: "PATCH", body: JSON.stringify(operation.name !== undefined ? { name: operation.name } : { trashed: operation.trashed }) });
  }
  async assignment(courseId: string, assignmentId: string) {
    return this.json(`${CLASSROOM}/courses/${id(courseId)}/courseWork/${id(assignmentId)}`);
  }
  async saveAssignment(courseId: string, fields: GoogleObject, assignmentId?: string) {
    const url = `${CLASSROOM}/courses/${id(courseId)}/courseWork`;
    if (assignmentId) {
      const current = await this.assignment(courseId, assignmentId);
      if (!current.associatedWithDeveloper) throw new GoogleError("Only assignments created by this application's Google project can be edited here. Open Classroom to edit this assignment.", 403);
      return this.json(`${url}/${id(assignmentId)}?updateMask=${Object.keys(fields).join(",")}`, { method: "PATCH", body: JSON.stringify(fields) });
    }
    return this.json(url, { method: "POST", body: JSON.stringify({ ...fields, workType: "ASSIGNMENT" }) });
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
    let total = 0;
    for (const post of posts.filter(p => p.type !== "courseWork")) {
      const text = [post.title, post.description].filter(Boolean).join("\n\n").trim();
      if (!text) continue;
      if (text.length > 250_000 || total + text.length > 600_000) throw new Error("Post text exceeds lesson text limit");
      total += text.length;
      sources.push({ id: `post-${post.type}-${post.id}`, title: `${post.title} (post text)`, mimeType: "text/plain", postIds: [post.id],
        passages: splitPassage({ id: `post-${post.type}-${post.id}-text`, text }),
        originalUrl: post.alternateLink || `https://classroom.google.com/c/${courseId}`, pdfAvailable: false });

    }
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
    const addSource = (source: StudySource) => {
      const size = source.passages.reduce((n, p) => n + p.text.length, 0);
      if (!size) throw new Error("No readable text found");
      if (size > 250_000 || total + size > 600_000)
        throw new Error("Document exceeds lesson text limit; select a shorter document");
      total += size;
      sources.push(source);
    };
    for (const post of posts.filter((p) => p.type === "courseWork")) {
      const classroomLink = post.alternateLink ? URL.parse(post.alternateLink) : null;
      const originalUrl = classroomLink?.origin === "https://classroom.google.com"
        ? classroomLink.href : "https://classroom.google.com";
      const source = {
        id: `classroom-courseWork-${post.id}`,
        title: `Assignment instructions: ${post.title}`,
        mimeType: "text/plain",
        postIds: [post.id],
        passages: splitPassage({ id: "instructions", text: [post.title, post.description].filter(Boolean).join("\n\n") }),
        originalUrl,
        pdfAvailable: false,
      };
      // Assignment instructions get the text budget before optional attachments.
      addSource(source);
      try {
        const rubrics = await this.list(`${CLASSROOM}/courses/${courseId}/courseWork/${post.id}/rubrics`, "rubrics");
        if (!rubrics.length) throw new Error("No teacher rubric is available for this assignment");
        for (const rubric of rubrics) {
          if (rubric.courseId !== courseId || rubric.courseWorkId !== post.id)
            throw new Error("Rubric does not belong to the selected assignment");
          addSource({
            ...source,
            id: `classroom-rubric-${post.id}-${id(rubric.id)}`,
            title: `Teacher rubric: ${post.title}`,
            passages: (rubric.criteria ?? []).flatMap((criterion: GoogleObject) => splitPassage({
              id: `criterion-${id(criterion.id)}`,
              text: [
                `Teacher rubric criterion: ${criterion.title || "Untitled criterion"}`,
                criterion.description,
                ...(criterion.levels ?? []).map((level: GoogleObject) => [
                  level.title,
                  level.description,
                  typeof level.points === "number" ? `${level.points} points` : "",
                ].filter(Boolean).join(" — ")),
              ].filter(Boolean).join("\n"),
            })),
          });
        }
      } catch (error) {
        if (error instanceof GoogleError && error.status === 401) throw error;
        failures.push({
          id: `classroom-rubric-${post.id}`,
          title: `Teacher rubric: ${post.title}`,
          reason: `Rubric unavailable: ${error instanceof Error ? error.message : "Unable to read rubric"}`,
        });
      }
    }
    for (const [fileId, attachment] of attachments) {
      try {
        const meta = await this.metadata(fileId);
        let passages: Passage[];
        if (meta.capabilities?.canDownload === false) throw new Error("The owner has disabled downloading this document");
        if (meta.mimeType === DOC) {
          passages = documentPassages(await this.json(`https://docs.googleapis.com/v1/documents/${id(fileId)}?includeTabsContent=true`));
          if (this.readFile) {
            try {
              const bytes = await this.download(fileId, meta);
              await pdfPassages(bytes.slice()); // Enforce the same PDF page limit on Workspace exports.
              passages.push(...await this.readFile(bytes, PDF, `${meta.name || fileId}.pdf`));
            }
            catch (error) {
              if (error instanceof GoogleError && error.status === 401) throw error;
              failures.push({ id: fileId, title: meta.name || attachment.title, reason: `Visual reading unavailable: ${error instanceof Error ? error.message : "file reader failed"}` });
            }
          }
        } else {
          const bytes = await this.download(fileId, meta);
          const mime = EXPORTABLE.includes(meta.mimeType) ? PDF : meta.mimeType;
          const name = EXPORTABLE.includes(meta.mimeType) ? `${meta.name || fileId}.pdf` : meta.name || attachment.title;
          if (mime.startsWith("text/")) passages = splitPassage({ id: "text", text: new TextDecoder().decode(bytes).trim() });
          else if (mime === PDF) {
            passages = await pdfPassages(bytes.slice());
            if (this.readFile) {
              try { passages.push(...await this.readFile(bytes, mime, name)); }
              catch (error) {
                if (!passages.length) throw error;
                failures.push({ id: fileId, title: name, reason: `Visual reading unavailable: ${error instanceof Error ? error.message : "file reader failed"}` });
              }
            } else failures.push({ id: fileId, title: name, reason: "Visual reading is not configured; only the PDF text layer was read." });
          } else if (this.readFile) passages = await this.readFile(bytes, mime, name);
          else throw new Error("Configure a vision-capable OPENAI_MODEL and OPENAI_API_KEY to read Office files and images");
        }
        const size = passages.reduce((n, p) => n + p.text.length, 0);
        if (!size)
          throw new Error(
            "No readable content found. Scanned PDFs require the configured visual reader",
          );
        addSource({
          id: fileId,
          title: meta.name || attachment.title,
          mimeType: meta.mimeType,
          postIds: attachment.postIds,
          passages,
          originalUrl:
            meta.mimeType === DOC
              ? `https://docs.google.com/document/d/${fileId}/edit`
              : `https://drive.google.com/file/d/${fileId}/view`,
          pdfAvailable: (meta.mimeType === PDF || EXPORTABLE.includes(meta.mimeType)) && meta.capabilities?.canDownload !== false,
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
