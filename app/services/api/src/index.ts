import { createApp } from "./app";
import { extensionTransport } from "./transport";
import { Store } from "./store";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import publicKey from "../../../apps/extension/assets/public-key.json";

const root = resolve(import.meta.dir, "../../..");
const port = Number(process.env.PORT || 8787);
const extensionId = createHash("sha256")
  .update(Buffer.from(publicKey.key, "base64"))
  .digest("hex")
  .slice(0, 32)
  .replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
const list = (value: string | undefined) =>
  (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const app = createApp({
  store: new Store(
    process.env.DATABASE_PATH || resolve(root, "data/study.sqlite"),
  ),
  config: {
    googleClientIds: list(process.env.GOOGLE_CLIENT_ID),
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "",
    realtimeModel: process.env.OPENAI_REALTIME_MODEL || "",
    allowedOrigins: [
      `http://localhost:${port}`,
      `http://127.0.0.1:${port}`,
      ...list(process.env.ALLOWED_ORIGINS),
      `chrome-extension://${process.env.EXTENSION_ID || extensionId}`,
    ],
    allowedEmails: list(process.env.ALLOWED_GOOGLE_USERS).map((x) =>
      x.toLowerCase(),
    ),
  },
});
Bun.serve({
  port,
  hostname: process.env.HOST || "127.0.0.1",
  idleTimeout: 120,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/openapi.json")
      return new Response(
        Bun.file(resolve(root, "packages/openapi/openapi.json")),
        { headers: { "Content-Type": "application/json" } },
      );
    if (url.pathname.startsWith("/api/"))
      return extensionTransport(request, app);
    const path = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    if (!/^[\w./-]+$/.test(path) || path.split("/").includes(".."))
      return new Response("Not found", { status: 404 });
    const file = Bun.file(resolve(root, "dist/web", path));
    if (!(await file.exists()))
      return new Response("Run bun run build first.", { status: 404 });
    return new Response(file, {
      headers: {
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-src 'self' blob:; object-src blob:; connect-src 'self' https://api.openai.com; media-src blob:; base-uri 'none'; frame-ancestors 'self'",
        "Referrer-Policy": "no-referrer",
      },
    });
  },
});
console.log(
  `Study is ready at http://localhost:${port}. Google and OpenAI configuration stays on the server.`,
);
