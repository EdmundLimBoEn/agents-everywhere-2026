import { mountStudy } from "./study";
import { attachVoice } from "./voice/realtime";
import type {
  ApiClient,
  PostRef,
} from "../../../packages/shared-types/src/study";
const root = document.getElementById("root")!;
const embedded = typeof chrome !== "undefined" && !!chrome.runtime?.id;
const api: ApiClient = async (path, init = {}) => {
  if (embedded) {
    const response = await chrome.runtime.sendMessage({
      type: "api",
      path,
      method: init.method || "GET",
      body: init.body,
    });
    if (!response?.ok)
      throw new Error(response?.error || "The extension could not connect.");
    return response.data;
  }
  const response = await fetch(path, {
    method: init.method || "GET",
    headers: { "Content-Type": "application/json" },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The request failed.");
  return result;
};
const query = new URLSearchParams(location.search);
let posts: PostRef[] = [];
try {
  const value: unknown = JSON.parse(query.get("posts") || "[]");
  if (Array.isArray(value) && value.length <= 30)
    posts = value.filter(
      (p): p is PostRef =>
        !!p &&
        typeof p.id === "string" &&
        ["courseWork", "courseWorkMaterials", "announcements"].includes(p.type),
    );
} catch {}
attachVoice(root, api);
mountStudy(root, api, {
  embedded,
  courseId: query.get("courseId") || undefined,
  courseRef: query.get("courseRef") || undefined,
  posts,
  intent: query.get("intent") === "relevant" ? "relevant" : undefined,
  ...(embedded
    ? {
        onClose: () =>
          window.parent.postMessage(
            { type: "classroom-study-close" },
            "https://classroom.google.com",
          ),
        onConnect: async () => {
          const response = await chrome.runtime.sendMessage({
            type: "connect",
          });
          if (!response?.ok)
            throw new Error(response?.error || "Google connection failed.");
        },
      }
    : {}),
});
window.addEventListener("pagehide", () =>
  root.dispatchEvent(new CustomEvent("study:close")),
);

window.addEventListener("message", (event) => {
  if (
    embedded &&
    event.source === window.parent &&
    event.origin === "https://classroom.google.com" &&
    event.data?.type === "classroom-study-hidden"
  )
    root.dispatchEvent(new CustomEvent("study:close"));
});
