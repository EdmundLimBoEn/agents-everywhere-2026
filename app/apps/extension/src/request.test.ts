import { expect, test } from "bun:test";
import { allowedMethods, allowedPath } from "./request";
test("only safe backend API routes receive authorization", () => {
  for (const path of [
    "/api/status",
    "/api/lessons?courseId=123",
    "/api/profile/evidence/request:evidence",
    "/api/profile/evidence/request%3Aevidence",
  ])
    expect(allowedPath(path)).toBe(true);
  for (const path of [
    "https://evil.test/api/status",
    "//evil.test/api/status",
    "/api/../private",
    "/api/%2e%2e/private",
    "/api/%2F/evil",
    "/api/status#x",
    "/api/status?redirect=https://evil.test",
    "/api/lessons?courseId=a&courseId=b",
    "/api/lessons?courseId=%2F",
    "/api/%ZZ",
    "/api/\\evil",
  ])
    expect(allowedPath(path)).toBe(false);
  expect(allowedMethods.has("PUT")).toBe(true);
  expect(allowedMethods.has("CONNECT")).toBe(false);
});

import { readApiResponse } from "./request";
test("stream heartbeats never become a successful API result", async () => {
  const response = (text: string) =>
    new Response(text, { headers: { "content-type": "application/x-ndjson" } });
  expect(
    await readApiResponse(
      response('{}\n{}\n{"status":200,"body":{"id":"lesson"}}\n'),
    ),
  ).toEqual({ status: 200, body: { id: "lesson" } });
  expect(
    await readApiResponse(
      response('{}\n{"status":401,"body":{"error":"Expired"}}'),
    ),
  ).toEqual({ status: 401, body: { error: "Expired" } });
  for (const text of [
    "",
    "{}\n",
    '{"status":200}',
    '{"status":900,"body":null}',
    '{"status":200,"body":null}\n{}',
  ])
    await expect(readApiResponse(response(text))).rejects.toThrow();
  expect(
    await readApiResponse(
      new Response('{"courses":[]}', {
        headers: { "content-type": "application/json" },
      }),
    ),
  ).toEqual({ status: 200, body: { courses: [] } });
});
test("transport accepts fragmented UTF-8 and JSON lines", async () => {
  const encoded = new TextEncoder().encode('{}\n{"status":200,"body":"葉"}\n');
  const stream = new ReadableStream({
    start(controller) {
      for (const byte of encoded) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    },
  });
  expect(
    await readApiResponse(
      new Response(stream, {
        headers: { "content-type": "application/x-ndjson" },
      }),
    ),
  ).toEqual({ status: 200, body: "葉" });
});
