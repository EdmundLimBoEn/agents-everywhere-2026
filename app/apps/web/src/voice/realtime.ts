import type {
  ApiClient,
  Lesson,
  TurnIntent,
} from "../../../../packages/shared-types/src/study";

export const voiceLessonPath = (lessonId: string, action: "voice" | "turn") =>
  `/api/lessons/${encodeURIComponent(lessonId)}/${action}`;

export function parseVoiceTurn(value: unknown): {
  intent: TurnIntent;
  text: string;
} {
  const allowed = [
    "teach",
    "answer",
    "question",
    "simplify",
    "example",
    "why",
    "skip",
    "recap",
  ];
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid voice action.");
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some((key) => !["intent", "text"].includes(key)) ||
    typeof input.intent !== "string" ||
    !allowed.includes(input.intent) ||
    typeof input.text !== "string" ||
    input.text.length > 4000 ||
    (["answer", "question"].includes(input.intent) && !input.text.trim())
  )
    throw new Error("Invalid voice action.");
  return { intent: input.intent as TurnIntent, text: input.text };
}

export function attachVoice(root: HTMLElement, api: ApiClient): () => void {
  let lesson: Lesson | undefined;
  let peer: RTCPeerConnection | undefined;
  let stream: MediaStream | undefined;
  let channel: RTCDataChannel | undefined;
  let abort: AbortController | undefined;
  let generation = 0;
  let state = "Voice is off";
  let connecting = false;
  let connectionTimer: ReturnType<typeof setTimeout> | undefined;
  const audio = document.createElement("audio");
  audio.autoplay = true;
  const render = () => {
    const controls = root.querySelector("[data-voice-controls]");
    if (!controls) return;
    const status = document.createElement("span");
    status.setAttribute("role", "status");
    status.textContent = state;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = peer || connecting ? "Stop voice" : "Start voice";
    button.addEventListener("click", () =>
      peer || connecting ? stop() : void start(),
    );
    controls.replaceChildren(status, button);
  };
  const stop = (message = "Voice is off") => {
    generation++;
    clearTimeout(connectionTimer);
    abort?.abort();
    abort = undefined;
    channel?.close();
    channel = undefined;
    if (peer) {
      peer.onconnectionstatechange = null;
      peer.ontrack = null;
      peer.close();
      peer = undefined;
    }
    stream?.getTracks().forEach((track) => track.stop());
    stream = undefined;
    audio.pause();
    audio.srcObject = null;
    connecting = false;
    state = message;
    root.dispatchEvent(
      new CustomEvent("study:voice-active", { detail: false }),
    );
    render();
  };
  const start = async () => {
    if (peer || connecting || !lesson) return;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      !globalThis.RTCPeerConnection
    ) {
      state = "Voice needs microphone access in a secure browser.";
      render();
      return;
    }
    const current = ++generation;
    const lessonId = lesson.id;
    connecting = true;
    state = "Connecting microphone…";
    render();
    const controller = new AbortController();
    abort = controller;
    connectionTimer = setTimeout(() => {
      if (current === generation)
        stop("Voice connection timed out. Please try again.");
    }, 120_000);
    try {
      root.dispatchEvent(
        new CustomEvent("study:voice-active", { detail: true }),
      );
      const saves: Promise<void>[] = [];
      root.dispatchEvent(
        new CustomEvent("study:flush-board", {
          detail: { waitUntil: (save: Promise<void>) => saves.push(save) },
        }),
      );
      await Promise.all(saves);
      if (current !== generation) return;
      const refreshed = await api<Lesson>(
        `/api/lessons/${encodeURIComponent(lessonId)}`,
      );
      if (current !== generation) return;
      lesson = refreshed;
      root.dispatchEvent(
        new CustomEvent("study:voice-lesson", { detail: refreshed }),
      );
      if (lesson.phase === "ready") {
        const started = await api<Lesson>(voiceLessonPath(lessonId, "turn"), {
          method: "POST",
          body: {
            intent: "teach",
            text: "",
            requestId: crypto.randomUUID(),
            revision: lesson.revision,
          },
        });
        if (current !== generation) return;
        lesson = started;
        root.dispatchEvent(
          new CustomEvent("study:voice-lesson", { detail: started }),
        );
      }
      const token = await api<{ value: string }>(
        voiceLessonPath(lessonId, "voice"),
        { method: "POST" },
      );
      if (current !== generation) return;
      if (typeof token.value !== "string" || !token.value)
        throw new Error("Voice session was not authorized.");
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (current !== generation) {
        mic.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = mic;
      const connection = new RTCPeerConnection();
      peer = connection;
      const events = connection.createDataChannel("oai-events");
      channel = events;
      const send = (event: unknown) => {
        if (current === generation && events.readyState === "open")
          events.send(JSON.stringify(event));
      };
      connection.ontrack = (event) => {
        audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        void audio
          .play()
          .catch(() => stop("Audio playback was blocked. Start voice again."));
      };
      connection.onconnectionstatechange = () => {
        if (
          ["failed", "disconnected", "closed"].includes(
            connection.connectionState,
          ) &&
          current === generation
        )
          stop("Voice disconnected. Start voice to reconnect.");
      };
      mic.getTracks().forEach((track) => {
        connection.addTrack(track, mic);
        track.onended = () => {
          if (current === generation) stop("Microphone disconnected.");
        };
      });
      const calls = new Set<string>();
      let pending = Promise.resolve();
      events.onopen = () => {
        clearTimeout(connectionTimer);
        connecting = false;
        state = "Listening · interrupt anytime";
        render();
        send({
          type: "response.create",
          response: {
            tool_choice: "none",
            instructions:
              "Speak the latest agent message from the lesson data. Do not submit a student turn until the student actually speaks.",
          },
        });
      };
      events.onclose = () => {
        if (current === generation) stop("Voice disconnected.");
      };
      events.onmessage = (event) => {
        let payload: any;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }
        if (payload.type === "input_audio_buffer.speech_started") {
          state = "Listening…";
          render();
        }
        if (
          payload.type === "response.output_audio.delta" ||
          payload.type === "output_audio_buffer.started"
        ) {
          state = "Tutor speaking · interrupt anytime";
          render();
        }
        if (payload.type === "error") {
          stop("Voice provider reported an error. Please reconnect.");
          return;
        }
        if (
          payload.type !== "response.function_call_arguments.done" ||
          typeof payload.call_id !== "string" ||
          calls.has(payload.call_id)
        )
          return;
        calls.add(payload.call_id);
        pending = pending.then(async () => {
          if (current !== generation || !lesson || lesson.id !== lessonId)
            return;
          try {
            if (payload.name !== "submit_student_turn")
              throw new Error("Unsupported voice action.");
            const turn = parseVoiceTurn(JSON.parse(payload.arguments));
            state = "Checking your answer against the notes…";
            render();
            const updated = await api<Lesson>(
              voiceLessonPath(lessonId, "turn"),
              {
                method: "POST",
                body: {
                  ...turn,
                  requestId: crypto.randomUUID(),
                  revision: lesson.revision,
                },
              },
            );
            if (current !== generation) return;
            lesson = updated;
            root.dispatchEvent(
              new CustomEvent("study:voice-lesson", { detail: updated }),
            );
            send({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: payload.call_id,
                output: JSON.stringify({
                  phase: updated.phase,
                  message: updated.messages.at(-1),
                }),
              },
            });
            send({
              type: "response.create",
              response: {
                tool_choice: "none",
                instructions:
                  "Speak the authoritative teaching message returned by the tool. Preserve its meaning and question. Do not call another tool until the student responds.",
              },
            });
          } catch {
            stop(
              "Voice turn could not be saved. Continue in text or reconnect.",
            );
          }
        });
      };
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      const response = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${token.value}`,
          "Content-Type": "application/sdp",
        },
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(`Voice connection unavailable (${response.status}).`);
      const sdp = await response.text();
      if (current !== generation) return;
      await connection.setRemoteDescription({ type: "answer", sdp });
    } catch (error) {
      if (current === generation)
        stop(
          error instanceof Error ? error.message : "Voice could not connect.",
        );
    }
  };
  const receiveLesson = (event: Event) => {
    const next = (event as CustomEvent<Lesson>).detail;
    if (lesson && lesson.id !== next.id) stop();
    lesson = next;
    render();
  };
  const request = () => {
    void start();
  };
  const close = () => stop();
  root.addEventListener("study:lesson", receiveLesson);
  root.addEventListener("study:voice-request", request);
  root.addEventListener("study:close", close);
  render();
  return () => {
    stop();
    root.removeEventListener("study:lesson", receiveLesson);
    root.removeEventListener("study:voice-request", request);
    root.removeEventListener("study:close", close);
  };
}
