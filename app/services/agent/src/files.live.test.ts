import { test, expect } from "bun:test";
import { fileReader } from "./files";
import { readdir } from "node:fs/promises";

// Opt in with synthetic browser-created evidence only. No school/user documents are discovered.
test.skipIf(process.env.RUN_LIVE_FILES !== "1")("live provider reads exported PDF, Word, Excel and image-only demo evidence", async () => {
  const directory = process.env.DEMO_EXPORT_DIR!;
  if (!directory) throw new Error("Set DEMO_EXPORT_DIR to the synthetic demo export directory");
  const read = fileReader({ apiKey: process.env.OPENAI_API_KEY || "", model: process.env.OPENAI_MODEL || "" });
  const formats = { png: "image/png", pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  for (const [extension, mime] of Object.entries(formats)) {
    const name = (await readdir(directory)).find(n => n.startsWith("Afterclass demo — ") && n.endsWith(`.${extension}`));
    if (!name) throw new Error(`Missing synthetic ${extension} export`);
    const passages = await read(new Uint8Array(await Bun.file(`${directory}/${name}`).arrayBuffer()), mime, name);
    expect(passages.some(p => /force|acceleration/i.test(p.text))).toBe(true);
    expect(passages.some(p => p.heading?.startsWith("AI-extracted"))).toBe(true);
  }
}, 180000);
