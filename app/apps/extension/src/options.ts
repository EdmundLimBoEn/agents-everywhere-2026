declare const API_ORIGIN: string;
const root = document.getElementById("root") || document.body;
root.innerHTML = `<main style="font:16px/1.6 system-ui;max-width:660px;margin:60px auto;padding:24px"><h1>Classroom study settings</h1><p>Open a class in Google Classroom, then select <strong>Study notes</strong>. Connect Google inside the study window to read your accessible class materials.</p><h2>Backend</h2><code id="origin"></code><p>The server address is fixed when building this extension. OAuth tokens stay in the background worker and are only sent to this server.</p><button id="disconnect">Disconnect Google</button><p id="status" role="status"></p><h2>Setup</h2><p>Your Google Cloud OAuth client must be configured for this extension’s ID. Enable the Classroom and Drive APIs and add your account as a test user when the consent screen is in testing.</p></main>`;
root.querySelector("#origin")!.textContent = API_ORIGIN;
root.querySelector("#disconnect")!.addEventListener("click", async () => {
  const result = await chrome.runtime.sendMessage({ type: "disconnect" });
  root.querySelector("#status")!.textContent = result.ok
    ? "Google disconnected. Reconnect from the study window when ready."
    : result.error;
});
