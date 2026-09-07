const log = (msg: string, cls = "") => {
  document.getElementById("log")!.innerHTML += `<div class="${cls}">${msg}</div>`;
};

const clear = () => { document.getElementById("log")!.innerHTML = ""; };

const showQr = (uri: string) => {
  const qr = document.getElementById("qr") as HTMLImageElement;
  qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(uri)}`;
  qr.style.display = "block";
  const open = document.getElementById("open") as HTMLAnchorElement;
  open.href = uri;
  open.style.display = "inline-block";
};

async function follow(sessionId: string) {
  const url = new URL(location.href);
  url.searchParams.set("session", sessionId);
  history.replaceState(null, "", url);

  for (;;) {
    const s = await fetch(`/api/session/${sessionId}`).then((r) => r.json());
    if (s.error) { log(`session not found — it may have expired`, "bad"); return; }
    if (s.connectorURI) showQr(s.connectorURI);

    if (s.state === "pending") { await new Promise((r) => setTimeout(r, 1500)); continue; }

    log(s.state === "verified" ? "verified" : "failed", s.state === "verified" ? "ok" : "bad");
    log(`<pre>${JSON.stringify(s.detail, null, 2).slice(0, 1200)}</pre>`);
    return;
  }
}

async function start() {
  const btn = document.getElementById("go") as HTMLButtonElement;
  btn.disabled = true;
  clear();
  try {
    const config = await fetch("/api/config").then((r) => r.json());
    log(`app ${config.appId}<br>rp ${config.rpId}<br>action ${config.action}`, "muted");

    const { sessionId, connectorURI } = await fetch("/api/session", { method: "POST" })
      .then((r) => r.json());
    showQr(connectorURI);
    log("Scan with the World ID <b>Sandbox</b> app, or tap Open on this phone.", "");
    log("The check continues on the server, so you can leave this page and come back.", "muted");
    await follow(sessionId);
  } catch (error) {
    log(`failed: ${(error as Error)?.message ?? String(error)}`, "bad");
  } finally {
    btn.disabled = false;
  }
}

document.getElementById("go")!.addEventListener("click", start);

const resuming = new URLSearchParams(location.search).get("session");
if (resuming) {
  log("resuming the check started earlier…", "muted");
  void follow(resuming);
}
