import type { ClassroomCourse, ClassroomPost, ClassroomTopic, Lesson, PostRef } from "../../../../packages/shared-types/src/study";

export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = "", cls = "") => {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = cls;
  return node;
};
export const btn = (text: string, action: () => void, cls = "") => {
  const node = el("button", text, cls);
  node.type = "button";
  node.onclick = action;
  return node;
};
const key = (p: PostRef) => `${p.type}:${p.id}`;
const day = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const formatDate = (value: string) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function mountDashboard(main: HTMLElement, options: {
  courses: ClassroomCourse[]; posts: ClassroomPost[]; topics: ClassroomTopic[];
  courseId: string; selected: Set<string>; lesson: Lesson | null;
  filters: { since?: string; minutes: number; topicId: string };
  teaching: boolean;
  onCourse: (id: string) => void; onRefresh: () => void; onHistory: () => void;
  onConnect?: () => void; onStudy: (posts: ClassroomPost[]) => void;
  onBuild: (posts: ClassroomPost[], minutes: number) => void;
  onOpen: (sourceId?: string, passageId?: string) => void;
  onHelp: (prompt: string) => void; onRelevant: (post: ClassroomPost) => void;
  onAssignment: (post: ClassroomPost) => void;
}) {
  const { courses, posts, selected, lesson } = options;
  const course = courses.find(c => c.id === options.courseId);
  const crew = lesson?.catchUp;
  main.className = "catchup-dashboard";
  main.replaceChildren();
  const sidebar = el("aside", "", "catchup-sidebar");
  const label = el("div", "", "catchup-classroom-brand");
  label.append(el("span", "▣", "catchup-classroom-icon"), el("span", "Classroom companion"));
  const nav = el("nav");
  nav.setAttribute("aria-label", "Catch Up navigation");
  const active = btn("✦  Catch Up", () => main.querySelector("h1")?.focus(), "catchup-nav-active");
  active.setAttribute("aria-current", "page");
  const savedLessons = btn("◷  Saved lessons", options.onHistory);
  savedLessons.disabled = !courses.length;
  nav.append(active, savedLessons);
  sidebar.append(label, nav, el("p", "YOUR CLASSES", "study-eyebrow"));
  const classes = el("nav", "", "catchup-classes");
  classes.setAttribute("aria-label", "Your classes");
  classes.classList.toggle("empty", !courses.length);
  courses.forEach((c, index) => {
    const button = btn("", () => options.onCourse(c.id), c.id === course?.id ? "selected" : "");
    button.setAttribute("aria-pressed", String(c.id === course?.id));
    button.style.setProperty("--class-color", ["#3671bf", "#187c55", "#8862b8", "#ae6334"][index % 4]!);
    button.append(el("span", c.name.slice(0, 1), "catchup-class-avatar"), el("span", c.name));
    classes.append(button);
  });
  if (!courses.length) classes.append(el("p", "Your classes appear here after you connect.", "study-meta"));
  sidebar.append(classes);
  const sidebarNote = el("div", "", "catchup-sidebar-note");
  sidebarNote.append(el("span", "↗", "catchup-note-star"), el("strong", "Right where you learn."), el("p", "Your notes, your next step, and a little help. All inside Classroom."));
  sidebar.append(sidebarNote, el("p", "AFTERCLASS / CATCH UP", "catchup-sidebar-footer"));

  const content = el("div", "", "catchup-content");
  const breadcrumb = el("div", "", "catchup-breadcrumb");
  breadcrumb.append(el("span", "Your classroom  /  Catch Up"), el("span", "✦  A LITTLE HELP, A CLEAR NEXT STEP", "study-eyebrow"));
  const intro = el("section", "", "catchup-intro");
  const heading = el("h1", "Let’s get you caught up.");
  heading.tabIndex = -1;
  intro.append(el("p", "WELCOME BACK", "study-eyebrow"), heading, el("p", "A little behind? You’re in the right place. Let’s take it one step at a time.", "study-deck"));
  content.append(breadcrumb, intro);
  main.append(sidebar, content);

  if (!courses.length) {
    const welcome = el("section", "", "catchup-connect");
    const art = el("div", "", "catchup-connect-art");
    art.setAttribute("aria-hidden", "true");
    art.append(el("span", "01", "catchup-art-number"), el("div", "Your class notes", "catchup-art-paper"), el("div", "✦  One clear plan", "catchup-art-plan"));
    const copy = el("div");
    copy.append(el("p", "START WITH YOUR CLASSROOM", "study-eyebrow"), el("h2", "Less catching up.\nMore getting it."), el("p", "Connect your class materials. Choose the time you have. Get a manageable plan with explanations you can trace back to your teacher’s notes."));
    if (options.onConnect) copy.append(btn("Connect Google Classroom →", options.onConnect, "study-primary"));
    else {
      const link = el("a", "Open Google Classroom ↗", "study-primary catchup-link");
      link.href = "https://classroom.google.com";
      link.target = "_blank"; link.rel = "noopener noreferrer";
      copy.append(link, el("p", "Use the Afterclass Chrome extension to connect your account. No class materials are loaded on this page yet.", "study-meta"));
    }
    welcome.append(copy, art);
    content.append(welcome, workflow());
    return;
  }

  const controls = el("form", "", "catchup-controls");
  const sinceLabel = el("label", "Updates since"), since = el("input");
  since.type = "date"; since.max = day(new Date());
  const previous = new Date(); previous.setDate(previous.getDate() - 3);
  since.value = options.filters.since ?? day(previous); since.required = true;
  sinceLabel.append(since);
  const timeLabel = el("label", "Time you have"), time = el("select");
  for (const minutes of [15, 25, 45, 60, 90]) {
    const o = el("option", `${minutes} minutes`); o.value = String(minutes); time.append(o);
  }
  time.value = String(crew?.minutes ?? options.filters.minutes);
  if (!time.value) { const o = el("option", `${crew!.minutes} minutes`); o.value = String(crew!.minutes); time.append(o); time.value = o.value; }
  timeLabel.append(time);
  const build = el("button", crew ? "Rebuild my plan  ↗" : "Build my plan  ↗", "study-primary");
  build.type = "submit";
  controls.append(sinceLabel, timeLabel, build);
  const status = el("div", "", "catchup-status"), totals = el("span");
  status.append(totals, btn("↻  Refresh materials", options.onRefresh));
  content.append(controls, status);
  let visible: ClassroomPost[] = [], topicId = options.filters.topicId;
  time.onchange = () => { options.filters.minutes = Number(time.value); };
  controls.onsubmit = event => {
    event.preventDefault();
    const chosen = visible.filter(p => selected.has(key(p)));
    if (controls.reportValidity()) options.onBuild(chosen.length ? chosen : visible, Number(time.value));
  };

  if (crew && lesson) {
    const layout = el("div", "", "catchup-plan-layout");
    const plan = el("section", "", "catchup-plan");
    const planHeader = el("div", "", "catchup-panel-heading");
    planHeader.append(el("div", "YOUR NEXT SMALL STEPS", "study-eyebrow"), el("h2", "Your catch-up plan"));
    const progress = el("span", "", "catchup-progress-label");
    planHeader.append(progress);
    const timeline = el("div", "", "catchup-timeline");
    timeline.setAttribute("aria-label", "Suggested study time");
    const planned = crew.plan.steps.reduce((sum, step) => sum + step.minutes, 0);
    crew.plan.steps.forEach((step, i) => {
      const segment = el("span", `${step.minutes} min`);
      segment.style.flex = String(step.minutes);
      segment.style.background = ["#187c55", "#6c9e7e", "#b4cabc", "#c5ad72", "#a9b6d0", "#9e88b5"][i]!;
      segment.title = step.text; timeline.append(segment);
    });
    if (planned < crew.minutes) {
      const space = el("span", `${crew.minutes - planned} min free`, "catchup-time-free");
      space.style.flex = String(crew.minutes - planned); timeline.append(space);
    }
    planHeader.append(timeline, el("p", `${planned} min planned · ${crew.minutes - planned} min breathing room`, "study-meta"));
    const storageKey = `afterclass:checklist:${lesson.id}`;
    const signatures = crew.plan.steps.map(s => JSON.stringify([s.text, s.citations]));
    let completed = new Set<string>();
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(storageKey) || "[]");
      if (Array.isArray(saved)) completed = new Set(saved.filter((s): s is string => typeof s === "string" && signatures.includes(s)));
    } catch { /* Storage is optional; the checklist still works for this visit. */ }
    const steps = el("ol", "", "catchup-steps");
    const updateProgress = () => { progress.textContent = `${completed.size} of ${crew.plan.steps.length} checked off`; };
    crew.plan.steps.forEach((step, index) => {
      const row = el("li", "", "catchup-step"), check = el("input"), text = el("div", "", "catchup-step-copy");
      check.type = "checkbox"; check.checked = completed.has(signatures[index]!);
      check.setAttribute("aria-label", `Mark step ${index + 1} complete`);
      row.classList.toggle("done", check.checked);
      check.onchange = () => {
        if (check.checked) completed.add(signatures[index]!); else completed.delete(signatures[index]!);
        row.classList.toggle("done", check.checked);
        try { localStorage.setItem(storageKey, JSON.stringify([...completed])); }
        catch { progress.title = "Your checklist is only saved for this visit."; }
        updateProgress();
      };
      text.append(el("span", `STEP ${String(index + 1).padStart(2, "0")} / ${course?.name ?? "CLASS MATERIALS"}`, "study-eyebrow"), el("h3", step.text), el("span", `◷  Suggested ${step.minutes} min`, "study-meta"));
      for (const citation of step.citations) {
        const source = lesson.sources.find(s => s.id === citation.sourceId);
        if (source?.passages.some(p => p.id === citation.passageId && p.text.includes(citation.quote)))
          text.append(btn(`▤  ${source.title}  ↗`, () => options.onOpen(source.id, citation.passageId), "catchup-source"));
      }
      const start = btn("Start ↗", () => options.onOpen(step.citations[0]?.sourceId, step.citations[0]?.passageId), index === 0 ? "study-primary" : "");
      start.setAttribute("aria-label", `Start step ${index + 1}`);
      row.append(check, text, start); steps.append(row);
    });
    updateProgress();
    plan.append(planHeader, steps, el("p", "ⓘ  Time estimates are suggestions. Checkmarks are your own record, saved on this device.", "catchup-plan-footnote"));
    const aside = el("aside", "", "catchup-reason");
    aside.append(el("span", "✦", "catchup-reason-star"), el("h2", "Why start here?"), el("p", crew.plan.reason));
    const first = crew.plan.steps[0]?.citations[0];
    if (first) {
      const source = lesson.sources.find(s => s.id === first.sourceId);
      if (source) aside.append(btn(`▤  Based on ${source.title}`, () => options.onOpen(source.id, first.passageId), "catchup-source"));
    }
    aside.append(el("hr"), el("h2", "A little help?"), el("p", "Get a nudge in the right direction, using your class materials."));
    aside.append(btn("▥  Explain the concept  ↗", () => options.onHelp(`Explain the concept behind this plan step: ${crew.plan.steps[0]?.text}`)), btn("♧  Give me a hint  ↗", () => options.onHelp(`Give me one hint, without solving the assignment, for: ${crew.plan.steps[0]?.text}`)));
    if (crew.review?.prerequisite) aside.append(el("p", `Revisit first: ${crew.review.prerequisite}`, "study-warning"));
    const details = el("details", "", "catchup-scout"), summary = el("summary", "What your class scout found");
    details.append(summary, el("p", crew.scout.text)); aside.append(details);
    layout.append(plan, aside); content.append(layout);
  } else content.append(workflow());

  const materials = el("section", "", "catchup-materials");
  const materialsHeader = el("div", "", "catchup-materials-header");
  materialsHeader.append(el("h2", "Your class updates"));
  const topic = el("select"); topic.setAttribute("aria-label", "Topic");
  const all = el("option", "All topics"); all.value = ""; topic.append(all);
  for (const t of options.topics) { const o = el("option", t.name); o.value = t.topicId; topic.append(o); }
  topic.value = topicId;
  const count = el("span", "", "study-meta");
  const study = btn("Study these together →", () => options.onStudy(visible.filter(p => selected.has(key(p)))));
  const history = btn("Resume a lesson", options.onHistory);
  materialsHeader.append(topic, count, study, history);
  const list = el("div", "", "catchup-updates");
  materials.append(materialsHeader, list); content.append(materials);
  function updateSelection() {
    const chosen = visible.filter(p => selected.has(key(p))).length;
    count.textContent = `${chosen} selected`;
    study.disabled = !chosen;
    build.disabled = !options.teaching || !(chosen || visible.length) || (chosen || visible.length) > 30;
    build.title = (chosen || visible.length) > 30 ? "Select up to 30 updates to build a plan." : "";
  }
  function renderUpdates() {
    visible = posts.filter(p => (!topicId || p.topicId === topicId) && (!since.value || !p.publishedAt || !Number.isFinite(Date.parse(p.publishedAt)) || new Date(p.publishedAt) >= new Date(`${since.value}T00:00:00`)));
    const deadlineCount = visible.filter(p => p.type === "courseWork" && p.dueAt && Date.parse(p.dueAt) >= Date.now() && Date.parse(p.dueAt) <= Date.now() + 3 * 86400000).length;
    totals.textContent = `${course?.name ?? "Choose a class"}  ·  ${visible.length} updates  ·  ${deadlineCount} due in the next 3 days`;
    list.replaceChildren();
    if (!visible.length) list.append(el("p", "All quiet here. Try an earlier date or a different topic.", "catchup-no-updates"));
    for (const post of visible) {
      const card = el("article", "", "catchup-update"), label = el("label"), check = el("input"), text = el("span");
      check.type = "checkbox"; check.checked = selected.has(key(post));
      check.onchange = () => { if (check.checked) selected.add(key(post)); else selected.delete(key(post)); updateSelection(); };
      const kind = post.type === "courseWork" ? "ASSIGNMENT" : post.type === "announcements" ? "ANNOUNCEMENT" : "LESSON MATERIAL";
      text.append(el("span", kind, "study-eyebrow"), el("strong", post.title), el("span", post.description.slice(0, 160), "study-description"));
      const published = post.publishedAt && Number.isFinite(Date.parse(post.publishedAt)) ? formatDate(post.publishedAt) : "Date unavailable";
      text.append(el("span", `${published} · ${post.attachments.length ? `${post.attachments.length} attached materials` : "Post text"}`, "study-meta"));
      label.append(check, text); card.append(label);
      if (post.dueAt && Number.isFinite(Date.parse(post.dueAt))) card.append(el("span", `Due ${formatDate(post.dueAt)}`, "catchup-due"));
      if (post.type === "courseWork") {
        const work = btn("Work on this assignment →", () => options.onAssignment(post), "study-primary catchup-assignment-action");
        work.disabled = !options.teaching;
        card.append(work, btn("Find helpful notes ↗", () => options.onRelevant(post), "catchup-source"));
      }
      list.append(card);
    }
    updateSelection();
  }
  topic.onchange = () => { options.filters.topicId = topicId = topic.value; renderUpdates(); };
  since.onchange = () => { options.filters.since = since.value; renderUpdates(); };
  renderUpdates();
  if (!options.teaching) content.append(el("p", "Your materials are available. Teaching needs to be connected before a plan can be built.", "study-warning"));
  content.append(el("footer", "Built around your classroom. Independent extension · Not affiliated with Google.", "catchup-footer"));
}

function workflow() {
  const strip = el("section", "", "catchup-workflow");
  strip.setAttribute("aria-label", "How your catch-up plan works");
  for (const [number, title, copy] of [["01", "See what changed", "Start with updates from your class."], ["02", "Make a little room", "Choose a plan that fits your time."], ["03", "Find your way forward", "Learn with your notes right beside you."]]) {
    const item = el("div");
    item.append(el("span", number, "catchup-workflow-number"), el("h3", title), el("p", copy));
    strip.append(item);
  }
  return strip;
}
