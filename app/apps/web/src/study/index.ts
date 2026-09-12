import { classroomCourseRef } from "../../../../packages/classroom-api/src/route";
import type {
  ApiClient,
  Board,
  ClassroomCourse,
  ClassroomPost,
  ClassroomTopic,
  LearnerProfile,
  Lesson,
  PostRef,
  TurnIntent,
} from "../../../../packages/shared-types/src/study";
import { manage } from "./manage";
import { mountBoard } from "./board";
import "./style.css";
import { el, btn, mountDashboard } from "./dashboard";
import { mountAssignment } from "./assignment";
export function mountStudy(
  root: HTMLElement,
  api: ApiClient,
  options: {
    embedded: boolean;
    intent?: string;
    courseRef?: string;
    courseId?: string;
    posts?: PostRef[];
    postRef?: string;
    onClose?: () => void;
    onConnect?: () => Promise<void>;
  },
) {
  root.classList.add("study-app");
  const dashboardFilters = { since: undefined as string | undefined, minutes: 45, topicId: "" };
  let courses: ClassroomCourse[] = [],
    posts: ClassroomPost[] = [],
    topics: ClassroomTopic[] = [],
    selected = new Set<string>(),
    courseId = "",
    lesson: Lesson | null = null,
    dashboardLesson: Lesson | null = null,
    activeSource = "",
    boardOpen = false,
    crewOpen = false,
    busy = false;
  const boards = new Map<
    string,
    { draft: Board; pending: Promise<void>; error: unknown }
  >();
  function saveBoard(id: string, board: Board) {
    let state = boards.get(id);
    if (!state) {
      state = { draft: board, pending: Promise.resolve(), error: null };
      boards.set(id, state);
    }
    state.draft = structuredClone(board);
    const snapshot = structuredClone(board),
      entry = state;
    entry.pending = entry.pending
      .catch(() => {})
      .then(async () => {
        try {
          await api(`/api/lessons/${id}/board`, {
            method: "PUT",
            body: snapshot,
          });
          entry.error = null;
          if (lesson?.id === id) lesson.board = entry.draft;
        } catch (error) {
          entry.error = error;
          throw error;
        }
      });
    void entry.pending.catch(() => {});
    return entry.pending;
  }
  function setBoardBusy(value: boolean) {
    main
      .querySelectorAll<HTMLElement>("[data-board-host]")
      .forEach((host) => (host.inert = value || voiceActive));
  }
  let voiceActive = false;
  root.addEventListener("study:flush-board", (event) => {
    const pending = lesson ? boards.get(lesson.id)?.pending : undefined;
    if (pending)
      (
        event as CustomEvent<{ waitUntil: (promise: Promise<void>) => void }>
      ).detail.waitUntil(pending);
  });
  root.addEventListener("study:voice-active", (event) => {
    voiceActive = Boolean((event as CustomEvent<boolean>).detail);
    setBoardBusy(busy || voiceActive);
  });
  let disposeBoard: (() => void) | undefined;
  let pdfUrl = "";
  function releasePDF() {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      pdfUrl = "";
    }
  }
  root.addEventListener("study:close", releasePDF);
  let status: {
    configured: { google: boolean; teaching: boolean; voice: boolean };
  } | null = null;
  const header = el("header", "", "study-header"),
    logo = el("div", "", "study-logo");
  logo.append(el("span", "✦", "study-mark"), el("span", "Afterclass"));
  header.append(
    logo,
    el("span", "CATCH UP, WITH A LITTLE HELP.", "study-tagline"),
  );
  const nav = el("nav");
  const learning = btn("My learning", () => void profile());
  learning.disabled = true;
  nav.append(learning, btn("Docs & assignments", () => manage(root, api, courseId, posts, lesson?.id || dashboardLesson?.id)));
  if (options.onClose)
    nav.append(
      btn("Close ×", () => {
        if (!root.dispatchEvent(new Event("study:before-close", { cancelable: true }))) return;
        root.dispatchEvent(new CustomEvent("study:close"));
        options.onClose!();
      }),
    );
  header.append(nav);
  const notice = el("div", "", "study-notice");
  notice.setAttribute("role", "status");
  const main = el("main");
  root.replaceChildren(header, notice, main);
  async function run<T>(job: () => Promise<T>): Promise<T | undefined> {
    if (busy) return;
    busy = true;
    setBoardBusy(true);
    root.setAttribute("aria-busy", "true");
    notice.replaceChildren(el("span", "Working…"));
    try {
      const result = await job();
      notice.replaceChildren();
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      notice.replaceChildren(el("span", message));
      if (/stale|revision|409/i.test(message) && lesson)
        notice.append(
          btn(
            "Reload lesson",
            () =>
              void run(async () => {
                lesson = await api<Lesson>(`/api/lessons/${lesson!.id}`);
                renderLesson();
              }),
          ),
        );
      else notice.append(btn("Retry", () => void run(job)));
      if (/auth|connect|token|401/i.test(message) && options.onConnect)
        notice.append(
          btn(
            "Reconnect Google",
            () =>
              void run(async () => {
                await options.onConnect!();
                await loadCourses();
              }),
          ),
        );
    } finally {
      busy = false;
      setBoardBusy(false);
      root.removeAttribute("aria-busy");
    }
  }
  async function loadCourses() {
    const result = await api<{ courses: ClassroomCourse[] }>("/api/courses");
    courses = result.courses;
    learning.disabled = false;
    const requested = options.courseId || options.courseRef;
    const ref = classroomCourseRef(options.courseRef);
    courseId = courses.find(c => c.id === requested || (!!ref && (c.id === ref || classroomCourseRef(c.alternateLink) === ref)))?.id || (requested ? "" : courses[0]?.id || "");
    if (courseId) await loadPosts();
    else renderPicker();
  }
  async function loadPosts() {
    const result = await api<{
      posts: ClassroomPost[];
      topics: ClassroomTopic[];
      warnings: string[];
    }>(`/api/courses/${encodeURIComponent(courseId)}/posts`);
    posts = result.posts;
    topics = result.topics;
    dashboardFilters.topicId = "";
    selected.clear();
    if (options.postRef) {
      const p = posts.find((p) => p.id === options.postRef);
      if (p) selected.add(key(p));
    }
    for (const ref of options.posts || [])
      if (posts.some((p) => key(p) === key(ref))) selected.add(key(ref));
    renderPicker();
    if (result.warnings?.length)
      main.prepend(el("p", result.warnings.join(" "), "study-warning"));
  }
  const key = (p: PostRef) => `${p.type}:${p.id}`;
  function forgetChecklist(id: string) {
    try { localStorage.removeItem(`afterclass:checklist:${id}`); } catch {}
  }
  function openDashboardLesson(sourceId?: string, passageId?: string) {
    if (!dashboardLesson) return;
    lesson = dashboardLesson;
    activeSource = sourceId || lesson.sources[0]?.id || "";
    boardOpen = false;
    renderLesson();
    if (passageId) {
      const passage = document.getElementById(`passage-${passageId}`);
      passage?.classList.add("highlight");
      passage?.focus();
      passage?.scrollIntoView({ block: "nearest" });
    }
  }
  function renderPicker() {
    disposeBoard?.();
    disposeBoard = undefined;
    root.dispatchEvent(new CustomEvent("study:close"));
    releasePDF();
    if (lesson?.catchUp) dashboardLesson = lesson;
    lesson = null;
    mountDashboard(main, {
      courses, posts, topics, courseId, selected, filters: dashboardFilters,
      lesson: dashboardLesson?.courseId === courseId ? dashboardLesson : null,
      teaching: status?.configured.teaching !== false,
      onCourse: id => void run(async () => { courseId = id; await loadPosts(); }),
      onRefresh: () => void run(loadPosts),
      onHistory: () => void history(),
      ...(options.onConnect ? { onConnect: () => void run(async () => { await options.onConnect!(); await loadCourses(); }) } : {}),
      onStudy: chosen => void createLesson(chosen),
      onBuild: (chosen, minutes) => void buildPlan(chosen, minutes),
      onOpen: openDashboardLesson,
      onHelp: prompt => {
        openDashboardLesson();
        void turn("question", prompt);
      },
      onRelevant: post => void relevant(post),
      onAssignment: post => void startAssignment(post),
    });
  }
  async function buildPlan(chosen: ClassroomPost[], minutes: number) {
    if (!chosen.length || chosen.length > 30) return;
    // Retain the created lesson and request ID if the provider needs a retry.
    let draft: Lesson | null = null;
    const requestId = crypto.randomUUID();
    await run(async () => {
      notice.replaceChildren(el("span", "Reading your selected class materials…"));
      draft ??= await api<Lesson>("/api/lessons", {
        method: "POST",
        body: { courseId, posts: chosen.map(({ id, type }) => ({ id, type })) },
      });
      notice.replaceChildren(el("span", "Your crew is building a plan around your notes and available time…"));
      dashboardLesson = await api<Lesson>(`/api/lessons/${draft.id}/turn`, {
        method: "POST",
        body: { intent: "teach", text: "", catchUpMinutes: minutes, requestId, revision: draft.revision },
      });
      renderPicker();
      main.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
    });
  }
  async function startAssignment(assignment: ClassroomPost) {
    if (assignment.type !== "courseWork") return;
    let preparedLesson: Lesson | null = null;
    const requestId = crypto.randomUUID();
    const assignedCourse = assignment.courseId;
    await run(async () => {
      if (!preparedLesson) {
        notice.replaceChildren(el("span", "Finding the notes that support this assignment…"));
        const related = await api<{ posts: ClassroomPost[] }>(`/api/courses/${encodeURIComponent(assignedCourse)}/relevant`, {
          method: "POST", body: { assignment: { id: assignment.id, type: assignment.type } },
        });
        const chosen = new Map<string, ClassroomPost>();
        chosen.set(key(assignment), assignment);
        for (const post of [...posts.filter(p => selected.has(key(p))), ...related.posts])
          if (post.courseId === assignedCourse && post.type !== "courseWork" && chosen.size < 30) chosen.set(key(post), post);
        preparedLesson = await api<Lesson>("/api/lessons", {
          method: "POST", body: { courseId: assignedCourse, posts: [...chosen.values()].map(({ id, type }) => ({ id, type })) },
        });
      }
      notice.replaceChildren(el("span", "Reading the assignment requirements and preparing your workspace…"));
      lesson = await api<Lesson>(`/api/lessons/${preparedLesson.id}/assignment`, {
        method: "POST", body: { action: "prepare", assignmentId: assignment.id, revision: preparedLesson.revision, requestId },
      });
      renderLesson();
    });
  }
  async function createLesson(chosen: ClassroomPost[]) {
    await run(async () => {
      lesson = await api<Lesson>("/api/lessons", {
        method: "POST",
        body: { courseId, posts: chosen.map(({ id, type }) => ({ id, type })) },
      });
      activeSource = lesson.sources[0]?.id || "";
      renderLesson();
    });
  }
  async function relevant(assignment: ClassroomPost) {
    await run(async () => {
      const result = await api<{ posts: ClassroomPost[] }>(
        `/api/courses/${encodeURIComponent(courseId)}/relevant`,
        {
          method: "POST",
          body: { assignment: { id: assignment.id, type: assignment.type } },
        },
      );
      const dialog = makeDialog("Review helpful notes");
      dialog.body.append(
        el("p", "Choose the suggested materials you want to study."),
      );
      const choices = new Set<string>();
      for (const post of result.posts) {
        const label = el("label", "", "study-review-choice"),
          check = el("input");
        check.type = "checkbox";
        check.onchange = () =>
          check.checked ? choices.add(key(post)) : choices.delete(key(post));
        label.append(check, el("span", post.title));
        dialog.body.append(label);
      }
      if (!result.posts.length)
        dialog.body.append(
          el("p", "No related materials found. You can choose posts manually."),
        );
      dialog.body.append(
        btn(
          "Use selected notes",
          () => {
            selected = choices;
            dialog.close();
            renderPicker();
          },
          "study-primary",
        ),
      );
    });
  }
  async function history() {
    await run(async () => {
      const data = await api<{
        lessons: { id: string; title: string; updatedAt: string }[];
      }>(`/api/lessons?courseId=${encodeURIComponent(courseId)}`);
      const d = makeDialog("Pick up where you left off");
      if (!data.lessons.length)
        d.body.append(el("p", "Your saved lessons will appear here."));
      for (const item of data.lessons) {
        const row = el("div", "", "study-history");
        row.append(
          btn(item.title, () => {
            d.close();
            void run(async () => {
              lesson = await api<Lesson>(`/api/lessons/${item.id}`);
              activeSource = lesson.sources[0]?.id || "";
              renderLesson();
            });
          }),
          btn(
            "Delete",
            () =>
              void run(async () => {
                await api(`/api/lessons/${item.id}`, { method: "DELETE" });
                forgetChecklist(item.id);
                if (lesson?.id === item.id) lesson = null;
                if (dashboardLesson?.id === item.id) {
                  dashboardLesson = null;
                  renderPicker();
                }
                row.remove();
              }),
          ),
        );
        d.body.append(row);
      }
    });
  }
  function makeDialog(title: string) {
    const d = el("dialog", "", "study-dialog"),
      body = el("div");
    d.append(
      el("h2", title),
      body,
      btn("Done", () => d.close()),
    );
    root.append(d);
    d.addEventListener("close", () => d.remove());
    d.showModal();
    return { body, close: () => d.close() };
  }
  async function profile() {
    await run(async () => {
      const p = await api<LearnerProfile>("/api/profile"),
        d = makeDialog("Your learning, in your hands");
      const form = el("form");
      form.onsubmit = (e) => e.preventDefault();
      function field(name: string, value: string) {
        const label = el("label", name),
          input = el("input");
        input.value = value;
        label.append(input);
        form.append(label);
        return input;
      }
      const name = field("Name", p.name),
        goals = field("Learning goals", p.goals);
      function choice(title: string, values: string[], value: string) {
        const label = el("label", title),
          select = el("select");
        for (const v of values) {
          const o = el("option", v);
          o.value = v;
          select.append(o);
        }
        select.value = value;
        label.append(select);
        form.append(label);
        return select;
      }
      const pace = choice("Pace", ["gentle", "balanced", "quick"], p.pace),
        explanation = choice(
          "Explain using",
          ["examples", "diagrams", "words"],
          p.explanation,
        );
      form.append(
        btn(
          "Save preferences",
          () =>
            void run(async () => {
              await api("/api/profile", {
                method: "PUT",
                body: {
                  name: name.value,
                  goals: goals.value,
                  pace: pace.value,
                  explanation: explanation.value,
                },
              });
              d.close();
            }),
          "study-primary",
        ),
      );
      d.body.append(form, el("h3", "What your tutor has noticed"));
      if (!p.evidence.length)
        d.body.append(el("p", "No learning observations yet."));
      for (const e of p.evidence) {
        const row = el("article", "", "study-evidence");
        row.append(
          el("strong", e.topic),
          el("p", `${e.assessment}: ${e.answer}`),
          el("p", e.misconception || e.intervention),
          btn(
            "Forget this observation",
            () =>
              void run(async () => {
                await api(`/api/profile/evidence/${e.id}`, {
                  method: "DELETE",
                });
                if (lesson?.id === e.lessonId) {
                  delete lesson.catchUp;
                  renderLesson();
                }
                if (dashboardLesson?.id === e.lessonId) {
                  delete dashboardLesson.catchUp;
                  forgetChecklist(e.lessonId);
                  if (!lesson) renderPicker();
                }
                row.remove();
              }),
          ),
        );
        d.body.append(row);
      }
      d.body.append(
        btn("Delete all my learning data", () => {
          const confirm = makeDialog("Delete all learning data?");
          confirm.body.append(
            el(
              "p",
              "This permanently deletes your saved lessons, preferences, and learning observations, plus all Catch Up checkmarks on this device.",
            ),
            btn(
              "Delete everything",
              () =>
                void run(async () => {
                  await api("/api/profile", { method: "DELETE" });
                  try {
                    for (const key of Object.keys(localStorage))
                      if (key.startsWith("afterclass:checklist:")) localStorage.removeItem(key);
                  } catch {}
                  lesson = null;
                  dashboardLesson = null;
                  confirm.close();
                  d.close();
                  renderPicker();
                }),
              "study-primary",
            ),
          );
        }),
      );
    });
  }
  async function turn(intent: TurnIntent, text = "", catchUpMinutes?: number) {
    if (!lesson) return;
    const lessonId = lesson.id,
      body = {
        intent,
        text,
        ...(catchUpMinutes !== undefined ? { catchUpMinutes } : {}),
        requestId: crypto.randomUUID(),
        revision: lesson.revision,
      };
    await run(async () => {
      const board = boards.get(lessonId);
      if (board) {
        await board.pending;
        if (board.error) throw board.error;
      }
      if (catchUpMinutes !== undefined || lesson?.catchUp)
        notice.replaceChildren(el("span", "Your crew is reading, planning, and preparing the next step…"));
      lesson = await api<Lesson>(`/api/lessons/${lessonId}/turn`, {
        method: "POST",
        body,
      });
      if (board) board.draft = structuredClone(lesson.board);
      followTeaching();
    });
  }
  function followTeaching() {
    const citation = lesson?.messages
      .filter((m) => m.role === "agent")
      .at(-1)
      ?.citations.find((c) =>
        lesson?.sources.some(
          (s) =>
            s.id === c.sourceId &&
            s.passages.some(
              (p) => p.id === c.passageId && p.text.includes(c.quote),
            ),
        ),
      );
    if (citation) {
      activeSource = citation.sourceId;
      boardOpen = false;
    }
    renderLesson();
    if (citation) {
      const passage = Array.from(
        root.querySelectorAll<HTMLElement>(".study-passage"),
      ).find((n) => n.id === `passage-${citation.passageId}`);
      passage?.classList.add("highlight");
      passage?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }
  function renderLesson() {
    if (!lesson) return;
    if (lesson.assignment) {
      root.dispatchEvent(new CustomEvent("study:close"));
      releasePDF();
      mountAssignment(main, api, lesson, {
        onBack: renderPicker,
        onLesson: updated => { lesson = updated; },
      });
      return;
    }
    releasePDF();
    main.className = "";
    const current = lesson;
    disposeBoard?.();
    disposeBoard = undefined;
    main.replaceChildren();
    const title = el("div", "", "study-lesson-title");
    title.append(
      btn("← Materials", renderPicker),
      el("h1", current.title),
      el("span", current.phase.replaceAll("_", " "), "study-phase"),
    );
    if (current.catchUp) title.append(btn("Your catch-up plan", renderPicker));
    main.append(title);
    for (const fail of current.failures)
      main.append(el("p", `${fail.title}: ${fail.reason}`, "study-warning"));
    if (current.failures.length)
      main.append(
        btn(
          "Reload materials",
          () =>
            void run(async () => {
              lesson = await api<Lesson>(`/api/lessons/${current.id}`);
              renderLesson();
            }),
        ),
      );
    const split = el("div", "", "study-split"),
      reader = el("section", "", "study-reader"),
      tabs = el("div", "", "study-tabs");
    tabs.setAttribute("aria-label", "Source documents");
    for (const source of current.sources) {
      const tab = btn(
        source.title,
        () => {
          activeSource = source.id;
          boardOpen = false;
          renderLesson();
        },
        !boardOpen && activeSource === source.id ? "active" : "",
      );
      tab.setAttribute(
        "aria-pressed",
        String(!boardOpen && activeSource === source.id),
      );
      tabs.append(tab);
    }
    tabs.append(
      btn(
        "Whiteboard",
        () => {
          boardOpen = true;
          renderLesson();
        },
        boardOpen ? "active" : "",
      ),
    );
    reader.append(tabs);
    const paper = el("div", "", "study-paper");
    reader.append(paper);
    if (boardOpen) {
      paper.dataset.boardHost = "";
      paper.inert = busy || voiceActive;
      const draft = boards.get(current.id);
      if (draft?.error)
        paper.append(
          el(
            "p",
            "Your unsaved whiteboard is kept here. Press Save to retry.",
            "study-warning",
          ),
        );
      disposeBoard = mountBoard(paper, draft?.draft || current.board, (board) =>
        saveBoard(current.id, board),
      );
    } else {
      const source =
        current.sources.find((s) => s.id === activeSource) ||
        current.sources[0];
      if (source) {
        activeSource = source.id;
        const tools = el("div", "", "study-tools");
        const link = el("a", "Open original ↗");
        try {
          const url = new URL(source.originalUrl);
          if (url.protocol === "https:") {
            link.href = url.href;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            tools.append(link);
          }
        } catch {}
        if (source.pdfAvailable)
          tools.append(
            btn(
              "View original PDF",
              () =>
                void run(async () => {
                  const { data } = await api<{ data: string }>(
                    `/api/lessons/${current.id}/sources/${encodeURIComponent(source.id)}/preview`,
                  );
                  const frame = el("iframe");
                  frame.title = source.title;
                  frame.className = "study-pdf";
                  pdfUrl = URL.createObjectURL(
                    new Blob(
                      [Uint8Array.from(atob(data), (c) => c.charCodeAt(0))],
                      { type: "application/pdf" },
                    ),
                  );
                  frame.src = pdfUrl;
                  paper.replaceChildren(
                    btn("← Read text", renderLesson),
                    frame,
                  );
                }),
            ),
          );
        paper.append(
          tools,
          el("p", "CLASS MATERIAL", "study-eyebrow"),
          el("h2", source.title),
        );
        for (const passage of source.passages) {
          const block = el("section", "", "study-passage");
          block.id = `passage-${passage.id}`;
          block.tabIndex = -1;
          if (passage.heading) block.append(el("h3", passage.heading));
          if (passage.page)
            block.append(el("span", `PAGE ${passage.page}`, "study-eyebrow"));
          block.append(el("p", passage.text));
          paper.append(block);
        }
      } else
        paper.append(
          el(
            "p",
            "No readable materials were returned. Choose a different post.",
          ),
        );
    }
    const tutor = el("section", "", "study-tutor");
    const tutorHeading = el("div", "", "study-tutor-heading");
    tutorHeading.append(
      el("span", "✳", "study-tutor-symbol"),
      el("div", "Your learning companion"),
      el("span", "Here with you", "study-meta"),
    );
    tutor.append(tutorHeading);
    const messages = el("div", "", "study-messages");
    messages.setAttribute("aria-live", "polite");
    if (!current.messages.length) {
      messages.append(
        el("p", "Understanding starts with a conversation.", "study-welcome"),
        el(
          "p",
          "I’ll ask what you already know, explain one idea at a time, and help you put it into your own words.",
        ),
      );
      messages.append(
        btn("Teach me this topic →", () => void turn("teach"), "study-primary"),
      );
      const catchUp = el("form", "", "study-catch-up-start"), label = el("label", "Time I have right now"), budget = el("input");
      budget.type = "number";
      budget.min = "5";
      budget.max = "120";
      budget.step = "1";
      budget.value = "25";
      budget.required = true;
      label.append(budget, el("span", " minutes"));
      const start = el("button", "Help me catch up →", "study-primary");
      start.type = "submit";
      catchUp.onsubmit = (event) => {
        event.preventDefault();
        if (catchUp.reportValidity()) void turn("teach", "", budget.valueAsNumber);
      };
      catchUp.append(el("p", "FOUR AGENTS. ONE WAY FORWARD.", "study-eyebrow"), el("h2", "Let’s find your next step."), el("p", "A scout, planner, tutor, and reviewer work together using the materials you selected."), label, start);
      messages.prepend(catchUp);
    }
    if (current.catchUp) {
      const crew = current.catchUp, panel = el("details", "", "study-crew");
      panel.open = crewOpen;
      panel.ontoggle = () => { crewOpen = panel.open; };
      const summary = el("summary", `Your catch-up crew · ${crew.minutes} min window`);
      summary.append(el("span", `Next: ${crew.plan.steps[0]?.text ?? "Review your plan"}`, "study-crew-next"));
      panel.append(summary);
      const addNote = (parent: HTMLElement, note: { text: string; citations: { sourceId: string; passageId: string; quote: string }[] }) => {
        parent.append(el("p", note.text));
        for (const citation of note.citations) {
          const source = current.sources.find((source) => source.id === citation.sourceId);
          if (!source?.passages.some((p) => p.id === citation.passageId && p.text.includes(citation.quote))) {
            parent.append(el("span", "Source unavailable; reload materials.", "study-warning"));
            continue;
          }
          parent.append(btn(`↗ ${source.title}`, () => {
            activeSource = source.id;
            boardOpen = false;
            renderLesson();
            const passage = [...root.querySelectorAll<HTMLElement>(".study-passage")].find((p) => p.id === `passage-${citation.passageId}`);
            passage?.classList.add("highlight");
            passage?.focus();
            passage?.scrollIntoView({ block: "nearest" });
          }, "study-citation"));
        }
      };
      const scout = el("section");
      scout.append(el("h3", "01 / Class scout"));
      addNote(scout, crew.scout);
      const review = el("section");
      review.append(el("h3", "02 / Reviewer"));
      if (crew.review) {
        addNote(review, crew.review);
        if (crew.review.prerequisite) review.append(el("p", `Revisit first: ${crew.review.prerequisite}`, "study-crew-gap"));
      } else review.append(el("p", "Waiting for an answer to check. No understanding assumed."));
      const plan = el("section");
      plan.append(el("h3", "03 / Planner"), el("p", crew.plan.reason));
      const steps = el("ol");
      for (const step of crew.plan.steps) {
        const item = el("li");
        item.append(el("strong", `${step.minutes} min`));
        addNote(item, step);
        steps.append(item);
      }
      plan.append(steps, el("p", "Time estimates for your next study window, not a completion record.", "study-meta"));
      const coach = el("section");
      coach.append(el("h3", "04 / Tutor"), el("p", "Your next learning step is below. Answer it and the crew will adjust."));
      panel.append(scout, review, plan, coach);
      tutor.append(panel);
    }
    for (const m of current.messages) {
      const article = el("article", "", `study-message ${m.role}`);
      article.append(
        el("span", m.role === "agent" ? "AFTERCLASS" : "YOU", "study-eyebrow"),
        el("p", m.text),
      );
      for (const c of m.citations) {
        const source = current.sources.find((s) => s.id === c.sourceId);
        if (
          !source?.passages.some(
            (p) => p.id === c.passageId && p.text.includes(c.quote),
          )
        ) {
          article.append(
            el(
              "span",
              "Source unavailable. Reload materials to check access.",
              "study-warning",
            ),
          );
          continue;
        }
        article.append(
          btn(
            `↗ ${source?.title || "Source"} · ${c.quote.slice(0, 70)}`,
            () => {
              activeSource = c.sourceId;
              boardOpen = false;
              renderLesson();
              const passage = Array.from(
                root.querySelectorAll<HTMLElement>(".study-passage"),
              ).find((n) => n.id === `passage-${c.passageId}`);
              if (passage) {
                passage.classList.add("highlight");
                passage.scrollIntoView({ behavior: "smooth", block: "center" });
                passage.focus({ preventScroll: true });
              }
            },
            "study-citation",
          ),
        );
      }
      messages.append(article);
    }
    if (current.phase === "complete" && current.evidence.length) {
      const recap = el("section", "", "study-recap");
      recap.append(el("h3", "Your learning today"));
      for (const evidence of current.evidence)
        recap.append(
          el(
            "p",
            `${evidence.assessment === "correct" ? "✓ Understood" : "↻ Revisit"} · ${evidence.topic}${evidence.misconception ? `: ${evidence.misconception}` : ""}`,
          ),
        );
      messages.append(recap);
    }
    tutor.append(messages);
    const actions = el("div", "", "study-quick-actions");
    for (const [label, intent] of [
      ["Simpler please", "simplify"],
      ["An example", "example"],
      ["Why?", "why"],
      ["Skip ahead", "skip"],
      ["Recap", "recap"],
    ] as [string, TurnIntent][])
      actions.append(btn(label, () => void turn(intent)));
    tutor.append(actions);
    const form = el("form", "", "study-composer"),
      input = el("textarea");
    input.placeholder = "Think out loud. Ask anything about your notes…";
    input.setAttribute("aria-label", "Your answer or question");
    input.rows = 2;
    const type = el("select");
    type.setAttribute("aria-label", "Message type");
    for (const [value, label] of [
      ["answer", "My answer"],
      ["question", "A question"],
    ]) {
      const o = el("option", label);
      o.value = value;
      type.append(o);
    }
    type.value = current.phase === "ready" ? "question" : "answer";
    const send = el("button", "Send ↗", "study-primary");
    send.type = "submit";
    form.append(input, type, send);
    form.onsubmit = (e) => {
      e.preventDefault();
      if (input.value.trim())
        void turn(type.value as TurnIntent, input.value.trim());
    };
    input.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    };
    tutor.append(form);
    const voice = el("div", "", "study-voice-host");
    voice.dataset.lessonId = current.id;
    voice.dataset.voiceControls = "";
    voice.append(
      btn("Talk it through", () =>
        root.dispatchEvent(new CustomEvent("study:voice-request")),
      ),
    );
    tutor.append(voice);
    split.append(reader, tutor);
    main.append(split);
    if (
      !current.sources.some((s) => s.passages.length) ||
      status?.configured.teaching === false
    ) {
      tutor
        .querySelectorAll<
          HTMLButtonElement | HTMLTextAreaElement | HTMLSelectElement
        >("button,textarea,select")
        .forEach((control) => {
          control.disabled = true;
        });
      tutor.prepend(
        el(
          "p",
          !current.sources.some((s) => s.passages.length)
            ? "Choose readable materials to begin teaching."
            : "Configure teaching credentials to begin.",
          "study-warning",
        ),
      );
    }
    root.dispatchEvent(new CustomEvent("study:lesson", { detail: current }));
    messages.scrollTop = current.messages.length ? messages.scrollHeight : 0;
  }
  root.addEventListener("study:voice-lesson", (event) => {
    lesson = (event as CustomEvent<Lesson>).detail;
    const board = boards.get(lesson.id);
    if (board && !board.error) board.draft = structuredClone(lesson.board);
    followTeaching();
  });
  renderPicker();
  void run(async () => {
    status = await api("/api/status");
    try {
      await loadCourses();
      if (
        !["relevant", "assignment"].includes(options.intent || "") &&
        options.posts?.length &&
        selected.size
      ) {
        lesson = await api<Lesson>("/api/lessons", {
          method: "POST",
          body: {
            courseId,
            posts: posts
              .filter((p) => selected.has(key(p)))
              .map(({ id, type }) => ({ id, type })),
          },
        });
        activeSource = lesson.sources[0]?.id || "";
        renderLesson();
      }
    } catch (e) {
      renderPicker();
      if (e instanceof Error && e.message === "Connect your Google account to read your Classroom materials.") return;
      throw e;
    }
  }).then(() => {
    if (["relevant", "assignment"].includes(options.intent || "")) {
      const assignment = posts.find(
        (p) => selected.has(key(p)) && p.type === "courseWork",
      );
      if (assignment) {
        if (options.intent === "assignment") void startAssignment(assignment);
        else void relevant(assignment);
      }
    }
  });
}
