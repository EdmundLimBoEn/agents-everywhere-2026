import { test, expect } from "bun:test";
import { extensionTransport } from "./transport";
test("long extension requests send headers and heartbeat before completion, preserving logical errors", async () => {
  let finish!: (value: Response) => void;
  const work = new Promise<Response>((r) => (finish = r));
  const response = await extensionTransport(
    new Request("http://local/api/lessons", {
      headers: { Accept: "application/x-ndjson" },
    }),
    () => work,
  );
  expect(response.headers.get("content-type")).toBe("application/x-ndjson");
  const reader = response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe("{}\n");
  finish(
    Response.json(
      { error: "Reconnect", code: "auth_required" },
      { status: 401 },
    ),
  );
  expect(
    JSON.parse(new TextDecoder().decode((await reader.read()).value)),
  ).toEqual({
    status: 401,
    body: { error: "Reconnect", code: "auth_required" },
  });
  expect((await reader.read()).done).toBe(true);
});
test("ordinary HTTP responses keep their status and JSON contract", async () => {
  const response = await extensionTransport(
    new Request("http://local/api/status"),
    async () => Response.json({ ok: true }, { status: 201 }),
  );
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ ok: true });
});
