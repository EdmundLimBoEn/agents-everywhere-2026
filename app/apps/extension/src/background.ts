import { allowedPath, allowedMethods, readApiResponse } from "./request";
declare const API_ORIGIN: string;
const apiOrigin = new URL(API_ORIGIN).origin;

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
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  const extensionPage = sender.url?.startsWith(chrome.runtime.getURL(""));
  const classroom = sender.url?.startsWith("https://classroom.google.com/");
  if (!extensionPage && !classroom) return false;
  void (async () => {
    let keepAlive: ReturnType<typeof setInterval> | undefined;
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
        return { ok: true, data: { connected: true } };
      }
      if (message?.type === "disconnect") {
        if (!extensionPage)
          throw new Error("Disconnect from extension settings.");
        await chrome.identity.clearAllCachedAuthTokens();
        return { ok: true, data: { connected: false } };
      }
      if (message?.type !== "api" || !allowedPath(message.path))
        throw new Error("Invalid API request.");
      const method = message.method || "GET";
      if (!allowedMethods.has(method)) throw new Error("Invalid API method.");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson",
      };
      if (message.path !== "/api/status") {
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
      const response = await fetch(`${apiOrigin}${message.path}`, {
        method,
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(240_000),
        ...(method !== "GET" && message.body !== undefined
          ? { body: JSON.stringify(message.body) }
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
