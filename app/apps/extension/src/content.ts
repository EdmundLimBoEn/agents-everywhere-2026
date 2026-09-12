import { classroomCourseRef, classroomPostRef } from "../../../packages/classroom-api/src/route";
import type {
  ClassroomPost as Post,
  ClassroomCourse as Course,
} from "../../../packages/shared-types/src/study";
const postKey = (post: Post) => `${post.type}:${post.id}`;
const marker = "data-classroom-study";
const selected = new Map<string, Post>();
let posts: Post[] = [];
let courseId = "";
let currentUrl = "";
let currentCourseRoute = "";
let frameContext = "";
const extensionOrigin = `chrome-extension://${chrome.runtime.id}`;
let generation = 0;
let timer: ReturnType<typeof setTimeout>;
const host = document.createElement("div");
host.setAttribute(marker, "launcher");
const shadow = host.attachShadow({ mode: "closed" });
shadow.innerHTML = `<style>:host{position:fixed;right:24px;bottom:24px;z-index:2147483646;font:14px system-ui}button{border:0;border-radius:24px;background:#155e51;color:white;padding:14px 22px;font:600 14px system-ui;cursor:pointer;box-shadow:0 4px 20px #0003}button:focus-visible{outline:3px solid #e0a72e;outline-offset:3px}dialog{border:0;padding:0;width:95vw;height:92vh;max-width:1500px;max-height:100vh;border-radius:16px;box-shadow:0 24px 80px #0005}dialog::backdrop{background:#112b3477}iframe{width:100%;height:100%;border:0}#close{position:absolute;top:8px;right:8px;padding:8px 12px;z-index:2}</style><button id="launch">Study notes</button><dialog aria-label="Study your class materials"><button id="close" aria-label="Close study window">✕</button><iframe title="Classroom adaptive teacher" allow="microphone"></iframe></dialog>`;
document.documentElement.append(host);
const launch = shadow.querySelector<HTMLButtonElement>("#launch")!;
const dialog = shadow.querySelector<HTMLDialogElement>("dialog")!;
const frame = shadow.querySelector<HTMLIFrameElement>("iframe")!;
let reloadRequired = false;
let previousFocus: HTMLElement | null = null;
let previousScroll = [0, 0];
function openStudy(items = [...selected.values()], intent?: string) {
  if (reloadRequired) { location.reload(); return; }
  if (!chrome.runtime?.id) {
    reloadRequired = true;
    launch.textContent = "Reload Classroom to reconnect";
    return;
  }
  frame.removeAttribute("srcdoc");

  previousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  previousScroll = [scrollX, scrollY];
  const url = new URL(chrome.runtime.getURL("study.html"));
  url.searchParams.set("courseRef", location.href);
  if (intent) url.searchParams.set("intent", intent);
  if (courseId) url.searchParams.set("courseId", courseId);
  if (items.length)
    url.searchParams.set(
      "posts",
      JSON.stringify(items.map(({ id, type }) => ({ id, type }))),
    );
  const context = JSON.stringify([
    courseId || currentCourseRoute,
    items.map(postKey).sort(),
    intent || "",
  ]);
  if (frameContext !== context) {
    frame.src = url.href;
    frameContext = context;
  }
  if (!dialog.open) dialog.showModal();
}
function closeStudy() {
  if (dialog.open) dialog.close();
}
function currentAssignment() {
  const ref = classroomPostRef(location.href);
  return ref && posts.find(p => p.type === "courseWork" && p.id === ref.postRef && p.courseId === ref.courseRef);
}
launch.addEventListener("click", () => {
  const assignment = currentAssignment();
  if (!selected.size && assignment) openStudy([assignment], "assignment");
  else openStudy();
});
shadow.querySelector("#close")!.addEventListener("click", closeStudy);
dialog.addEventListener("close", () => {
  frame.contentWindow?.postMessage(
    { type: "classroom-study-hidden" },
    extensionOrigin,
  );
  previousFocus?.focus({ preventScroll: true });
  scrollTo(...(previousScroll as [number, number]));
});
// Only the extension's own iframe may request closure; Classroom page messages have no authority.
window.addEventListener("message", (event) => {
  if (
    event.source === frame.contentWindow &&
    event.origin === extensionOrigin &&
    event.data?.type === "classroom-study-close"
  )
    closeStudy();
});
function updateLabel() {
  launch.textContent = selected.size
    ? `Study these together (${selected.size})`
    : currentAssignment() ? "Work on this assignment" : "Study notes";
}
function matchesCourse(course: Course) {
  const ref = classroomCourseRef(location.href);
  return !!ref && (ref === course.id || ref === classroomCourseRef(course.alternateLink));
}
async function loadPosts() {
  const revision = ++generation;
  posts = [];
  document.querySelectorAll(`[${marker}="post"]`).forEach((el) => el.remove());
  try {
    const result = await chrome.runtime.sendMessage({
      type: "api",
      path: "/api/courses",
    });
    if (!result.ok || revision !== generation) return;
    const courses: Course[] = result.data.courses || result.data;
    const course = courses.find(matchesCourse);
    if (!course) {
      courseId = "";
      selected.clear();
      updateLabel();
      return;
    }
    if (courseId !== course.id) {
      selected.clear();
      updateLabel();
    }
    courseId = course.id;
    const response = await chrome.runtime.sendMessage({
      type: "api",
      path: `/api/courses/${encodeURIComponent(course.id)}/posts`,
    });
    if (!response.ok || revision !== generation) return;
    posts = response.data.posts || response.data;
    for (const key of selected.keys())
      if (!posts.some((post) => postKey(post) === key)) selected.delete(key);
    updateLabel();
    attachControls();
  } catch {
    /* The study overlay provides the connection and retry controls. */
  }
}
function postElement(post: Post): HTMLElement | null {
  // Google changes presentation classes frequently. Only match a verified API identifier or URL.
  for (const el of document.querySelectorAll<HTMLElement>(
    "[data-stream-item-id],[data-item-id],[data-post-id],[data-id]",
  )) {
    if (
      ["data-stream-item-id", "data-item-id", "data-post-id", "data-id"].some(
        (name) => el.getAttribute(name) === post.id,
      )
    )
      return el;
  }
  // Otherwise find a link to this post. Compare decoded route ids so /u/N/ prefixes,
  // relative hrefs, query strings and the /details suffix do not matter.
  for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    if (a.closest(`[${marker}]`)) continue;
    if (post.alternateLink && a.href === post.alternateLink)
      return postContainer(a);
    const ref = classroomPostRef(a.href);
    if (ref && ref.postRef === post.id && ref.courseRef === post.courseId)
      return postContainer(a);
  }
  return null;
}
function postContainer(link: HTMLElement): HTMLElement {
  const preferred = link.closest<HTMLElement>(
    'article,[role="listitem"],li,[data-stream-item-id]',
  );
  if (preferred) return preferred;
  // Classroom cards are block containers noticeably larger than the inline link inside them.
  // Walk up to the first card-sized ancestor, never as far as the page or its main column.
  const stop = new Set<Element | null>([
    document.body,
    document.documentElement,
    document.querySelector("main"),
    document.querySelector('[role="main"]'),
  ]);
  const linkWidth = link.getBoundingClientRect().width;
  let node: HTMLElement | null = link.parentElement;
  for (let depth = 0; node && !stop.has(node) && depth < 8; depth++) {
    const rect = node.getBoundingClientRect();
    if (rect.height >= 48 && rect.width >= Math.max(240, linkWidth)) return node;
    node = node.parentElement;
  }
  return link.parentElement ?? link;
}
function attachControls() {
  for (const post of posts) {
    const container = postElement(post);
    if (!container || container.querySelector(`[${marker}="post"]`)) continue;
    const controls = document.createElement("div");
    controls.setAttribute(marker, "post");
    controls.style.cssText =
      "display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 16px;background:#eff8f5;border-top:1px solid #cee1da;font:14px system-ui";
    const label = document.createElement("label");
    label.style.cssText =
      "display:flex;align-items:center;gap:8px;cursor:pointer";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selected.has(postKey(post));
    checkbox.setAttribute("aria-label", `Select ${post.title} for study`);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selected.set(postKey(post), post);
      else selected.delete(postKey(post));
      updateLabel();
    });
    label.append(checkbox, document.createTextNode("Select for study"));
    controls.append(label);
    const button = (text: string, items: Post[], intent?: string) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.style.cssText =
        "background:white;color:#155e51;border:1px solid #b1cfc4;border-radius:16px;padding:6px 12px;cursor:pointer";
      b.addEventListener("click", () => openStudy(items, intent));
      controls.append(b);
    };
    if (post.type === "courseWork") button("Work on this assignment", [post], "assignment");
    button(
      post.type === "courseWork"
        ? "Find notes that help with this"
        : "Study with the lesson notes",
      [post],
      post.type === "courseWork" ? "relevant" : undefined,
    );
    if (post.topicId)
      button(
        "Study this topic",
        posts.filter((p) => p.topicId === post.topicId),
      );
    controls.addEventListener("click", (event) => event.stopPropagation());
    container.append(controls);
  }
}
function refresh() {
  if (currentUrl !== location.href) {
    currentUrl = location.href;
    const nextCourseRoute = classroomCourseRef(location.href) || "";
    if (currentCourseRoute !== nextCourseRoute) {
      currentCourseRoute = nextCourseRoute;
      courseId = "";
      selected.clear();
      updateLabel();
    }
    void loadPosts();
  } else attachControls();
}
new MutationObserver(() => {
  clearTimeout(timer);
  timer = setTimeout(refresh, 200);
}).observe(document.body, { childList: true, subtree: true });
window.addEventListener("popstate", refresh);
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "open-study") openStudy();
  if (message.type === "connected") void loadPosts();
});
refresh();
