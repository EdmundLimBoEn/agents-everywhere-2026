import type { ApiClient, ClassroomPost } from "../../../../packages/shared-types/src/study";
import { el, btn } from "./dashboard";

export function manage(root: HTMLElement, api: ApiClient, courseId: string, posts: ClassroomPost[], lessonId?: string) {
  const dialog = el("dialog", "", "study-dialog"), status = el("p"), form = el("div");
  status.setAttribute("role", "status");
  dialog.append(el("h2", "Docs & assignments"), el("p", "Read Drive files, prepare a document, then attach it to a new Classroom assignment. Review the text before saving."), status, form, btn("Done", () => dialog.close()));
  dialog.addEventListener("close", () => dialog.remove());
  root.append(dialog);
  dialog.showModal();
  let busy = false, documentId = "", revisionId = "", tabId = "", assignmentId = "", assignmentReady = true;
  async function run(job: () => Promise<void>) {
    if (busy) return;
    busy = true;
    form.inert = true;
    status.textContent = "Working…";
    try { await job(); }
    catch (e) { status.textContent = `${e instanceof Error ? e.message : e} If a save was interrupted, refresh Drive or Classroom to check its result before repeating it.`; }
    finally { busy = false; form.inert = false; }
  }
  function field(labelText: string, multiline = false) {
    const label = el("label", labelText), input = multiline ? el("textarea") : el("input");
    if (input instanceof HTMLTextAreaElement) input.rows = 7;
    label.append(input); form.append(label); return input;
  }
  const prompt = field("Ask the agent to draft", true);
  form.append(btn("Generate draft for review", () => void run(async () => {
    const draft = await api<{ title: string; text: string }>("/api/author/draft", { method: "POST", body: { prompt: prompt.value, ...(lessonId ? { lessonId } : {}), ...(documentId ? { documentId } : {}) } });
    title.value = draft.title; text.value = draft.text;
    status.textContent = "Draft ready. Review and edit it before saving.";
  })));
  const title = field("Title"), text = field("Document text / assignment instructions", true);
  const result = el("div");
  function link(label: string, href: string) {
    const a = el("a", label); a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; result.append(a, el("br"));
  }
  form.append(btn("Create Google Doc", () => void run(async () => {
    const doc = await api<{ id: string }>("/api/documents", { method: "POST", body: { title: title.value, text: text.value } });
    documentId = doc.id; docRef.value = doc.id;
    attachment.value = [...new Set([...attachment.value.split(/\s+/).filter(Boolean), doc.id])].join("\n");
    link("Open created Google Doc", `https://docs.google.com/document/d/${encodeURIComponent(doc.id)}/edit`);
    status.textContent = "Google Doc created and selected for attachment. Save the assignment below to attach it.";
  })));
  form.append(el("h3", "Drive files"));
  const query = field("Search Drive by name"), files = el("div");
  form.append(btn("Search Drive", () => void run(async () => {
    const data = await api<{ files: { id: string; name: string; mimeType: string }[] }>("/api/drive/search", { method: "POST", body: { query: query.value } });
    files.replaceChildren();
    for (const file of data.files) {
      const row = el("p", `${file.name} · ${file.mimeType} `);
      row.append(btn("Attach", () => { attachment.value = [...new Set([...attachment.value.split(/\s+/).filter(Boolean), file.id])].join("\n"); }));
      if (file.mimeType === "application/vnd.google-apps.document") row.append(btn("Load Doc", () => { docRef.value = file.id; void loadDocument(); }));
      const original = el("a", "Open original"); original.href = `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`; original.target = "_blank"; original.rel = "noopener noreferrer"; row.append(original); files.append(row);
    }
    status.textContent = `${data.files.length} Drive files found.`;
  })), files);
  const docRef = field("Google Doc ID"), preview = el("pre");
  preview.style.whiteSpace = "pre-wrap";
  async function loadDocument() {
    await run(async () => {
      const doc = await api<{ title: string; revisionId: string; tabs: { tabId: string }[]; passages: { text: string }[] }>(`/api/documents/${encodeURIComponent(docRef.value.trim())}`);
      documentId = docRef.value.trim(); revisionId = doc.revisionId; tabId = doc.tabs[0]?.tabId || "";
      title.value = doc.title;
      preview.textContent = doc.passages.map(p => p.text).join("\n\n");
      status.textContent = "Document loaded. Append adds the editor text to the first tab and preserves existing content.";
    });
  }
  form.append(btn("Load Google Doc", () => void loadDocument()), preview,
    btn("Rename loaded Doc", () => void run(async () => {
      if (!documentId) throw new Error("Load or create a document first");
      await api(`/api/documents/${documentId}`, { method: "PATCH", body: { name: title.value } }); status.textContent = "Document renamed.";
    })),
    btn("Append text to loaded Doc", () => void run(async () => {
      if (!documentId || !revisionId) throw new Error("Load the document before appending");
      await api(`/api/documents/${documentId}`, { method: "PATCH", body: { append: `\n${text.value}`, revisionId, ...(tabId ? { tabId } : {}) } });
      revisionId = ""; status.textContent = "Text appended. Reload the document before another edit.";
    })),
    btn("Move loaded Doc to trash", () => {
      if (!documentId || !confirm("Move this document to Google Drive trash? Assignments linking it may lose access.")) return;
      void run(async () => { await api(`/api/documents/${documentId}`, { method: "PATCH", body: { trashed: true } }); status.textContent = "Document moved to trash. Use Restore to undo."; });
    }),
    btn("Restore loaded Doc", () => void run(async () => {
      if (!documentId) throw new Error("Load a document first");
      await api(`/api/documents/${documentId}`, { method: "PATCH", body: { trashed: false } }); status.textContent = "Document restored.";
    })),
    el("h3", "Classroom assignment"));
  const assignmentLabel = el("label", "Assignment"), assignment = el("select");
  assignment.append(el("option", "New assignment")); assignment.options[0]!.value = "";
  for (const post of posts.filter(p => p.type === "courseWork")) { const option = el("option", post.title); option.value = post.id; assignment.append(option); }
  assignmentLabel.append(assignment); form.append(assignmentLabel);
  assignment.onchange = () => void run(async () => {
    assignmentReady = false;
    assignmentId = assignment.value;
    attachment.disabled = !!assignmentId; share.disabled = !!assignmentId;
    if (!assignmentId) { assignmentReady = true; status.textContent = "Creating a new assignment; attachments can be selected."; return; }
    const data = await api<{ title: string; description?: string; state: string; associatedWithDeveloper: boolean; dueDate?: { year: number; month: number; day: number }; dueTime?: { hours: number; minutes: number }; maxPoints?: number }>(`/api/courses/${courseId}/assignments/${assignmentId}`);
    assignmentReady = true;
    title.value = data.title; text.value = data.description || ""; state.value = data.state;
    points.value = String(data.maxPoints ?? 0);
    due.value = data.dueDate ? new Date(Date.UTC(data.dueDate.year, data.dueDate.month - 1, data.dueDate.day, data.dueTime?.hours || 0, data.dueTime?.minutes || 0)).toISOString().slice(0, 16) : "";
    status.textContent = data.associatedWithDeveloper ? "Assignment loaded. Google allows attachment changes only when creating an assignment." : "This assignment was created outside this Google project. Edit it in Classroom.";
  });
  const attachment = field("Attachment Drive IDs (one per line)", true);
  const shareLabel = el("label", "Attachment access"), share = el("select");
  for (const [value, label] of [["VIEW", "Students can view"], ["EDIT", "Students can edit"], ["STUDENT_COPY", "Make a copy for each student"]]) { const o = el("option", label); o.value = value!; share.append(o); }
  shareLabel.append(share); form.append(shareLabel);
  const due = field("Deadline (UTC)") as HTMLInputElement; due.type = "datetime-local";
  const points = field("Maximum points") as HTMLInputElement; points.type = "number"; points.min = "0"; points.value = "100";
  const stateLabel = el("label", "Assignment visibility"), state = el("select");
  for (const value of ["DRAFT", "PUBLISHED", "DELETED"]) { const o = el("option", value); o.value = value; state.append(o); }
  stateLabel.append(state); form.append(stateLabel, el("p", "Saving PUBLISHED makes the assignment visible to students. Google requires teacher access; existing assignments must belong to this app’s Google project."));
  form.append(btn("Save assignment", () => {
    if (state.value !== "DRAFT" && !confirm(`Save this assignment with state ${state.value}? This changes what students can access.`)) return;
    void run(async () => {
      if (!assignmentReady) throw new Error("Reload the selected assignment before saving");
      if (!courseId) throw new Error("Choose a Classroom course first");
      const saved = await api<{ id: string }>(`/api/courses/${courseId}/assignments${assignmentId ? `/${assignmentId}` : ""}`, { method: assignmentId ? "PATCH" : "POST", body: {
        title: title.value, description: text.value, state: state.value, maxPoints: Number(points.value), dueAt: due.value ? `${due.value}:00.000Z` : null,
        ...(!assignmentId ? { attachments: [...new Set(attachment.value.split(/\s+/).filter(Boolean))].map(id => ({ id, shareMode: share.value })) } : {}),
      } });
      assignmentId = saved.id;
      if (![...assignment.options].some(o => o.value === saved.id)) { const option = el("option", title.value); option.value = saved.id; assignment.append(option); }
      assignment.value = saved.id;
      attachment.disabled = true; share.disabled = true;
      link("Open saved assignment", `https://classroom.google.com/c/${courseId}/a/${saved.id}/details`);
      status.textContent = "Assignment saved. Further saves update this assignment.";
    });
  }), result);
}
