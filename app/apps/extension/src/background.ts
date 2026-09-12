import { allowedPath, allowedMethods, readApiResponse } from "./request";
import {
  badgeText,
  badgeTitle,
  classroomLink,
  dueSoon,
  notificationCopy,
  notificationKey,
  pendingNotifications,
} from "./dueSoon";
import type {
  ClassroomCourse,
  ClassroomPost,
} from "../../../packages/shared-types/src/study";
declare const API_ORIGIN: string;
const apiOrigin = new URL(API_ORIGIN).origin;
const DUE_ALARM = "afterclass-due-soon";
const NOTIFIED_KEY = "dueSoonNotified";
const LINKS_KEY = "dueSoonLinks";

function token(interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (result) => {
      const error = chrome.runtime.lastError;
      const value = typeof result === "string" ? result : result?.token;
      if (error || !value)
        reject(
          new Error(
            error?.message || "Connect your Google account to continue.",
          ),
        );
      else resolve(value);
    });
  });
}

type ApiResult =
  | { ok: true; data: any }
  | { ok: false; code: string; error: string };

/** The only path from the extension to the backend. The Google token is attached here and nowhere else. */
async function backendRequest(
  path: unknown,
  method = "GET",
  body?: unknown,
): Promise<ApiResult> {
  let keepAlive: ReturnType<typeof setInterval> | undefined;
  try {
    if (!allowedPath(path)) throw new Error("Invalid API request.");
    if (!allowedMethods.has(method)) throw new Error("Invalid API method.");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    };
    if (path !== "/api/status") {
      try {
        headers.Authorization = `Bearer ${await token(false)}`;
      } catch {
        return {
          ok: false,
          code: "AUTH_REQUIRED",
          error: "Connect your Google account to access class materials.",
        };
      }
    }
    // Bound work below MV3's five-minute event limit while the server streams heartbeats.
    keepAlive = setInterval(() => {
      void chrome.runtime.getPlatformInfo().catch(() => {});
    }, 20_000);
    const response = await fetch(`${apiOrigin}${path}`, {
      method,
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(240_000),
      ...(method !== "GET" && body !== undefined
        ? { body: JSON.stringify(body) }
        : {}),
    });
    const { status, body: data } = await readApiResponse(response);
    if (status < 200 || status >= 300) {
      if (status === 401 && headers.Authorization) {
        await chrome.identity.removeCachedAuthToken({
          token: headers.Authorization.slice(7),
        });
      }
      return {
        ok: false,
        code: status === 401 ? "AUTH_REQUIRED" : data?.code || "API_ERROR",
        error:
          data?.error?.message ||
          data?.error ||
          `Request failed (${status}).`,
      };
    }
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      code: "REQUEST_FAILED",
      error: error instanceof Error ? error.message : "Request failed.",
    };
  } finally {
    if (keepAlive !== undefined) clearInterval(keepAlive);
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  const extensionPage = sender.url?.startsWith(chrome.runtime.getURL(""));
  const classroom = sender.url?.startsWith("https://classroom.google.com/");
  if (!extensionPage && !classroom) return false;
  void (async (): Promise<ApiResult> => {
    try {
      if (message?.type === "connect") {
        if (!extensionPage) throw new Error("Connect from the study window.");
        await token(true);
        for (const tab of await chrome.tabs.query({
          url: "https://classroom.google.com/*",
        })) {
          if (tab.id)
            void chrome.tabs
              .sendMessage(tab.id, { type: "connected" })
              .catch(() => {});
        }
        void checkDueSoon();
        return { ok: true, data: { connected: true } };
      }
      if (message?.type === "disconnect") {
        if (!extensionPage)
          throw new Error("Disconnect from extension settings.");
        await chrome.identity.clearAllCachedAuthTokens();
        await clearDueSoon();
        return { ok: true, data: { connected: false } };
      }
      if (message?.type !== "api") throw new Error("Invalid API request.");
      return await backendRequest(
        message.path,
        typeof message.method === "string" ? message.method : "GET",
        message.body,
      );
    } catch (error) {
      return {
        ok: false,
        code: "REQUEST_FAILED",
        error: error instanceof Error ? error.message : "Request failed.",
      };
    }
  })().then(respond);
  return true;
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id && tab.url?.startsWith("https://classroom.google.com/")) {
    await chrome.tabs
      .sendMessage(tab.id, { type: "open-study" })
      .catch(() => chrome.tabs.reload(tab.id!));
  } else await chrome.tabs.create({ url: "https://classroom.google.com/" });
});

/**
 * The due-soon agent. Once an hour, and right after the student connects, it reads each active class's
 * deadlines, sets the toolbar badge to the number of assignments due within 48 hours, and announces each
 * new deadline once. It reads only what Classroom already shows the student and never opens the study window itself.
 */
async function checkDueSoon(): Promise<void> {
  try {
    await token(false);
  } catch {
    await clearDueSoon();
    return;
  }
  const courses = await backendRequest("/api/courses");
  if (!courses.ok) {
    if (courses.code === "AUTH_REQUIRED") await clearDueSoon();
    return;
  }
  const list: ClassroomCourse[] = courses.data.courses ?? courses.data ?? [];
  const soon: ClassroomPost[] = [];
  for (const course of list) {
    const result = await backendRequest(
      `/api/courses/${encodeURIComponent(course.id)}/posts`,
    );
    if (result.ok) soon.push(...dueSoon(result.data.posts ?? result.data ?? []));
  }
  soon.sort((a, b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!));
  await chrome.action.setBadgeBackgroundColor({ color: "#d93025" });
  await chrome.action.setBadgeText({ text: badgeText(soon.length) });
  await chrome.action.setTitle({ title: badgeTitle(soon.length) });

  const stored: Record<string, unknown> = await chrome.storage.local.get([
    NOTIFIED_KEY,
    LINKS_KEY,
  ]);
  const rawNotified = stored[NOTIFIED_KEY];
  const notified: string[] = Array.isArray(rawNotified)
    ? rawNotified.filter((k): k is string => typeof k === "string")
    : [];
  const rawLinks = stored[LINKS_KEY];
  const links: Record<string, string> = {};
  if (rawLinks && typeof rawLinks === "object")
    for (const [id, url] of Object.entries(rawLinks))
      if (typeof url === "string") links[id] = url;
  for (const post of pendingNotifications(soon, notified)) {
    const key = notificationKey(post);
    const id = `due:${key}`;
    const copy = notificationCopy(
      post,
      list.find((course) => course.id === post.courseId),
    );
    links[id] = classroomLink(post.alternateLink);
    try {
      await chrome.notifications.create(id, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icon-128.png"),
        title: copy.title,
        message: copy.message,
        priority: 1,
      });
    } catch {
      /* Notifications may be disabled by the OS; the badge still shows the count. */
    }
    notified.push(key);
  }
  const recent = notified.slice(-200);
  const keep = new Set(recent.map((key) => `due:${key}`));
  for (const id of Object.keys(links)) if (!keep.has(id)) delete links[id];
  await chrome.storage.local.set({ [NOTIFIED_KEY]: recent, [LINKS_KEY]: links });
}

async function clearDueSoon(): Promise<void> {
  await chrome.action.setBadgeText({ text: "" });
  await chrome.action.setTitle({ title: badgeTitle(0) });
}

async function scheduleDueSoon(): Promise<void> {
  await chrome.alarms.create(DUE_ALARM, { periodInMinutes: 60, delayInMinutes: 1 });
  void checkDueSoon();
}

chrome.runtime.onInstalled.addListener(() => void scheduleDueSoon());
chrome.runtime.onStartup.addListener(() => void scheduleDueSoon());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === DUE_ALARM) void checkDueSoon();
});
chrome.notifications.onClicked.addListener((id) => {
  void (async () => {
    const stored: Record<string, unknown> =
      await chrome.storage.local.get(LINKS_KEY);
    const saved = stored[LINKS_KEY];
    const url = classroomLink(
      saved && typeof saved === "object"
        ? (saved as Record<string, unknown>)[id]
        : undefined,
    );
    await chrome.tabs.create({ url });
    chrome.notifications.clear(id);
  })();
});
