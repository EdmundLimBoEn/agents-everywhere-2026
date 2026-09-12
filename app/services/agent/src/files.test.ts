import { test, expect } from "bun:test";
import { fileReader } from "./files";

test("file reader sends actual bytes, labels interpretation, caches identical content", async () => {
  const requests: any[] = [];
  const reader = fileReader({ apiKey: "test", model: "vision-test", fetcher: (async (_: unknown, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)));
    return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ passages: [{ text: "A red leaf", location: "Image" }], limitations: "Color interpretation" }) }] }] });
  }) as typeof fetch });
  const bytes = new Uint8Array([1, 2, 3]);
  const result = await reader(bytes, "image/png", "leaf.png");
  expect(requests[0].input[0].content[1]).toMatchObject({ type: "input_image", image_url: "data:image/png;base64,AQID" });
  expect(result[0]?.heading).toBe("AI-extracted · Image");
  result[0]!.text = "Changed";
  expect((await reader(bytes, "image/png", "leaf.png"))[0]?.text).toBe("A red leaf");
  expect(requests).toHaveLength(1);
  await reader(bytes, "application/pdf", "scan.pdf");
  expect(requests[1].input[0].content[1]).toMatchObject({ type: "input_file", filename: "scan.pdf", file_data: "data:application/pdf;base64,AQID" });
});


test("malformed or empty file readings fail instead of inventing a source", async () => {
  for (const value of [{ passages: [], limitations: "Unreadable" }, { passages: [{ text: "x".repeat(2001), location: "page" }], limitations: "" }]) {
    const read = fileReader({ apiKey: "test", model: "test", fetcher: (async (_: unknown, _init: RequestInit) => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] })) as typeof fetch });
    await expect(read(new Uint8Array([1]), "application/pdf", "scan.pdf")).rejects.toThrow();
  }
});
