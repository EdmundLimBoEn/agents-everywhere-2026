import { expect, test } from "bun:test";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

test("rebuilding removes stale files and keeps server credentials out of bundles", async () => {
  const root = resolve(import.meta.dir, "..");
  const secret = "test-only-private-build-canary";
  const stale = ["web", "extension"].map((name) => resolve(root, "dist", name, "stale-build-test.txt"));
  for (const path of stale) {
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, "Old files must not ship in a rebuilt extension.");
  }
  const child = Bun.spawn([process.execPath, "scripts/build.ts"], {
    cwd: root, stdout: "pipe", stderr: "pipe",
    env: { ...process.env, OPENAI_API_KEY: secret },
  });
  const [status, result, errors] = await Promise.all([
    child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
  ]);
  if (status !== 0) throw new Error(errors || result);
  expect(result).toContain("Built AfterClass web UI and Chrome extension");
  const manifest = await Bun.file(resolve(root, "dist/extension/manifest.json")).json();
  expect(manifest.name).toBe("AfterClass — learn inside Classroom");
  expect(manifest.icons).toEqual({ 32: "mark-32.png", 128: "mark-128.png" });
  expect(manifest.action.default_icon).toEqual(manifest.icons);
  for (const size of [32, 128]) {
    const file = `mark-${size}.png`;
    const packaged = Buffer.from(await Bun.file(resolve(root, "dist/extension", file)).arrayBuffer());
    expect(packaged).toEqual(Buffer.from(await Bun.file(resolve(root, "../assets/brand", file)).arrayBuffer()));
    expect(packaged.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(packaged.readUInt32BE(16)).toBe(size);
    expect(packaged.readUInt32BE(20)).toBe(size);
  }
  for (const file of ["web/index.html", "extension/study.html", "extension/options.html"]) {
    const html = await Bun.file(resolve(root, "dist", file)).text();
    expect(html).toContain("<title>AfterClass · ");
    expect(html).not.toContain("Afterclass");
  }
  for (const path of stale) expect(await Bun.file(path).exists()).toBe(false);
  for (const bundle of ["web", "extension"]) {
    const directory = resolve(root, "dist", bundle);
    for (const file of await readdir(directory)) {
      if (/\.(?:js|map|html|json)$/.test(file))
        expect(await Bun.file(resolve(directory, file)).text()).not.toContain(secret);
    }
  }
}, 30_000);
