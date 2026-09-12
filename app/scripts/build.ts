import {
  mkdir,
  cp,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
const root = resolve(import.meta.dir, "..");
const { key } = JSON.parse(
  await readFile(
    resolve(root, "apps/extension/assets/public-key.json"),
    "utf8",
  ),
);
const extensionId = createHash("sha256")
  .update(Buffer.from(key, "base64"))
  .digest("hex")
  .slice(0, 32)
  .replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
const origin = new URL(process.env.API_ORIGIN || "http://localhost:8787");
if (
  origin.pathname !== "/" ||
  origin.search ||
  origin.hash ||
  origin.username ||
  origin.password ||
  !(
    origin.protocol === "https:" ||
    (origin.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(origin.hostname))
  )
)
  throw new Error(
    "API_ORIGIN must be an HTTPS origin or loopback HTTP origin.",
  );
for (const dir of ["dist/web", "dist/extension"])
  await mkdir(resolve(root, dir), { recursive: true });
const ui = await Bun.build({
  entrypoints: [resolve(root, "apps/web/src/entry.ts")],
  outdir: resolve(root, "dist/web"),
  target: "browser",
  minify: true,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  conditions: ["production"],
  sourcemap: "external",
});
if (!ui.success) throw new AggregateError(ui.logs, "UI build failed");
for (const name of await readdir(resolve(root, "dist/web")))
  await cp(
    resolve(root, "dist/web", name),
    resolve(root, "dist/extension", name),
    { recursive: true },
  );
for (const destination of ["dist/web", "dist/extension"])
  await cp(resolve(root, "node_modules/@excalidraw/excalidraw/dist/prod/fonts"),
    resolve(root, destination, "fonts"), { recursive: true });
const ext = await Bun.build({
  entrypoints: ["background", "content", "options"].map((n) =>
    resolve(root, `apps/extension/src/${n}.ts`),
  ),
  outdir: resolve(root, "dist/extension"),
  target: "browser",
  format: "esm",
  define: { API_ORIGIN: JSON.stringify(origin.origin) },
});
if (!ext.success) throw new AggregateError(ext.logs, "Extension build failed");
const page = (title: string, script: string, css?: string) =>
  `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="A manageable catch-up plan, grounded in your Classroom notes. Learn one step at a time with Afterclass."><link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="11" fill="#187c55"/><path d="M20 5Q22 18 35 20Q22 22 20 35Q18 22 5 20Q18 18 20 5" fill="white"/></svg>')}"><title>${title}</title>${css ? `<link rel="stylesheet" href="${css}">` : ""}</head><body><div id="root"></div><script type="module" src="${script}"></script></body></html>`;
await writeFile(
  resolve(root, "dist/web/index.html"),
  page("Afterclass · Catch Up in Classroom", "entry.js", "entry.css"),
);
await writeFile(
  resolve(root, "dist/extension/study.html"),
  page("Afterclass · Study with your notes", "entry.js", "entry.css"),
);
await writeFile(
  resolve(root, "dist/extension/options.html"),
  page("Afterclass · Settings", "options.js"),
);
const manifest = {
  manifest_version: 3,
  minimum_chrome_version: "120",
  name: "Afterclass — learn inside Classroom",
  version: "1.0.0",
  description: "An adaptive teacher beside your actual Classroom materials.",
  key,
  permissions: ["identity", "storage"],
  host_permissions: ["https://classroom.google.com/*", `${origin.origin}/*`],
  background: { service_worker: "background.js", type: "module" },
  action: { default_title: "Study your Classroom notes" },
  options_page: "options.html",
  content_scripts: [
    {
      matches: ["https://classroom.google.com/*"],
      js: ["content.js"],
      run_at: "document_idle",
    },
  ],
  web_accessible_resources: [
    {
      resources: ["study.html", "entry.js", "entry.css"],
      matches: ["https://classroom.google.com/*"],
    },
  ],
  content_security_policy: {
    extension_pages:
      "script-src 'self'; object-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-src 'self' blob:; connect-src 'self' https://api.openai.com " +
      origin.origin,
  },
  ...(process.env.GOOGLE_CLIENT_ID
    ? {
        oauth2: {
          client_id: process.env.GOOGLE_CLIENT_ID.split(",")[0],
          scopes: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/classroom.courses.readonly",
            "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
            "https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly",
            "https://www.googleapis.com/auth/classroom.announcements.readonly",
            "https://www.googleapis.com/auth/classroom.topics.readonly",
            "https://www.googleapis.com/auth/documents.readonly",
            "https://www.googleapis.com/auth/drive.readonly",
          ],
        },
      }
    : {}),
};
await writeFile(
  resolve(root, "dist/extension/manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  `Built Afterclass web UI and Chrome extension. Extension ID: ${extensionId}`,
);
if (!process.env.GOOGLE_CLIENT_ID)
  console.log(
    "Google connection requires GOOGLE_CLIENT_ID; set it in app/.env and rebuild.",
  );
