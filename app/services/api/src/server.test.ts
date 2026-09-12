import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createConnection } from "node:net";

test("HTTP server confines static files to the web bundle", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "afterclass-server-"));
  const canary = resolve(directory, "private.txt");
  await writeFile(canary, "Private files must never be served.");
  const server = Bun.spawn([process.execPath, "services/api/src/index.ts"], {
    cwd: resolve(import.meta.dir, "../../.."),
    env: {
      ...process.env, PORT: "0", HOST: "127.0.0.1", DATABASE_PATH: ":memory:",
      GOOGLE_CLIENT_ID: "", OPENAI_API_KEY: "", ALLOWED_ORIGINS: "",
    },
    stdout: "pipe", stderr: "inherit",
  });
  try {
    let output = "";
    const reader = server.stdout.getReader();
    while (!output.includes("\n")) {
      const { value, done } = await reader.read();
      if (done) break;
      output += new TextDecoder().decode(value);
    }
    reader.releaseLock();
    const origin = output.match(/http:\/\/[^\s]+/)?.[0];
    expect(origin).toBeDefined();
    const status = await fetch(`${origin}api/status`);
    expect(status.status).toBe(200);
    expect((await status.json()).configured.google).toBe(false);
    const url = new URL(origin!);
    for (const path of [`/${canary}`, `//${canary}`, "/.env"]) {
      // Fetch normalizes repeated slashes; send the actual attacker-controlled path.
      const response = await new Promise<string>((resolve, reject) => {
        let data = "";
        const socket = createConnection({ host: url.hostname, port: Number(url.port) }, () => {
          socket.write(`GET ${path} HTTP/1.1\r\nHost: ${url.host}\r\nConnection: close\r\n\r\n`);
        });
        socket.setEncoding("utf8");
        socket.setTimeout(5000, () => socket.destroy(new Error("HTTP response timed out")));
        socket.on("data", (chunk) => { data += chunk; });
        socket.on("end", () => resolve(data));
        socket.on("error", reject);
      });
      expect(response).toMatch(/^HTTP\/1\.1 404 /);
      expect(response).not.toContain("Private files must never be served.");
    }
  } finally {
    server.kill();
    await server.exited;
    await rm(directory, { recursive: true, force: true });
  }
}, 15_000);
