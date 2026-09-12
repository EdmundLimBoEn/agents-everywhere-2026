/** Keep long model/document requests responsive to the MV3 worker's fetch deadline.
 * Normal HTTP clients retain normal status codes. The extension explicitly negotiates
 * NDJSON, whose final frame carries the underlying HTTP status and JSON response.
 */
export function extensionTransport(
  request: Request,
  handle: (request: Request) => Promise<Response>,
): Response | Promise<Response> {
  if (
    request.headers.get("accept") !== "application/x-ndjson" ||
    request.method === "OPTIONS"
  )
    return handle(request);
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (value: unknown) => {
        if (!closed)
          controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
      };
      send({});
      timer = setInterval(() => send({}), 10000);
      void handle(request)
        .then(async (response) => {
          const body = await response.json();
          send({ status: response.status, body });
        })
        .catch(() =>
          send({
            status: 500,
            body: {
              error: "The request could not be completed.",
              code: "service_error",
            },
          }),
        )
        .finally(() => {
          clearInterval(timer);
          if (!closed) {
            closed = true;
            controller.close();
          }
        });
    },
    cancel() {
      closed = true;
      clearInterval(timer);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
