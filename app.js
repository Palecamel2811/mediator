const $ = (id) => document.getElementById(id);

const state = {
  roomId: null,
  participantId: null,
  roleLabel: null,
  name: null,
  lastCount: -1,
  polling: false,
};

const SESSION_KEY = "mediator-session";

function saveSession() {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    roomId: state.roomId,
    participantId: state.participantId,
    roleLabel: state.roleLabel,
    name: state.name,
  }));
}

function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (s && s.roomId && s.participantId) {
      Object.assign(state, s);
      return true;
    }
  } catch {}
  return false;
}

function show(screen) {
  $("landing").hidden = screen !== "landing";
  $("room").hidden = screen !== "room";
}

function setError(el, msg) {
  $(el).textContent = msg || "";
  $(el).hidden = !msg;
}

async function api(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---- LANDING ----
$("create-btn").addEventListener("click", async () => {
  setError("landing-error", "");
  try {
    const data = await api("/api/create", { action: "create", name: $("create-name").value.trim() });
    Object.assign(state, { roomId: data.roomId, participantId: data.participantId, roleLabel: data.roleLabel, name: data.name });
    saveSession();
    enterRoom();
  } catch (e) {
    setError("landing-error", e.message);
  }
});

$("join-btn").addEventListener("click", async () => {
  setError("landing-error", "");
  const code = $("join-code").value.trim().toUpperCase();
  if (!code) return setError("landing-error", "Enter a room code.");
  try {
    const data = await api("/api/create", { action: "join", roomId: code, name: $("join-name").value.trim() });
    Object.assign(state, { roomId: data.roomId, participantId: data.participantId, roleLabel: data.roleLabel, name: data.name });
    saveSession();
    enterRoom();
  } catch (e) {
    setError("landing-error", e.message);
  }
});

// ---- ROOM ----
function enterRoom() {
  show("room");
  $("room-code-label").textContent = `Room ${state.roomId}`;
  startPolling();
  refresh();
}

$("leave-btn").addEventListener("click", () => {
  state.polling = false;
  localStorage.removeItem(SESSION_KEY);
  Object.assign(state, { roomId: null, participantId: null, roleLabel: null, name: null, lastCount: -1 });
  $("raw-input").value = "";
  hidePreview();
  show("landing");
});

$("share-btn").addEventListener("click", async () => {
  const url = `${location.origin}/?room=${state.roomId}`;
  try {
    await navigator.clipboard.writeText(url);
    $("share-btn").textContent = "Copied!";
    setTimeout(() => ($("share-btn").textContent = "Copy invite"), 1500);
  } catch {
    prompt("Share this link:", url);
  }
});

// ---- COMPOSER ----
$("translate-btn").addEventListener("click", async () => {
  setError("composer-error", "");
  const raw = $("raw-input").value.trim();
  if (!raw) return setError("composer-error", "Write something first.");
  $("translate-btn").disabled = true;
  try {
    const data = await api("/api/mediate", { raw, roomId: state.roomId });
    $("mediated-input").value = data.mediated || "";
    $("coaching").textContent = data.coaching || "";
    $("techniques").innerHTML = (data.techniques || [])
      .map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join("");
    $("preview").hidden = false;
    $("send-btn").disabled = false;
  } catch (e) {
    setError("composer-error", e.message);
  } finally {
    $("translate-btn").disabled = false;
  }
});

$("send-btn").addEventListener("click", async () => {
  setError("composer-error", "");
  const raw = $("raw-input").value.trim();
  const mediated = $("mediated-input").value.trim();
  if (!mediated) return setError("composer-error", "Translate first, then send.");
  $("send-btn").disabled = true;
  try {
    await api("/api/messages", {
      roomId: state.roomId,
      participantId: state.participantId,
      raw,
      mediated,
    });
    $("raw-input").value = "";
    hidePreview();
    refresh();
  } catch (e) {
    setError("composer-error", e.message);
    $("send-btn").disabled = false;
  }
});

$("clear-btn").addEventListener("click", () => {
  $("raw-input").value = "";
  hidePreview();
});

function hidePreview() {
  $("preview").hidden = true;
  $("mediated-input").value = "";
  $("coaching").textContent = "";
  $("techniques").innerHTML = "";
  $("send-btn").disabled = true;
}

// ---- POLLING / RENDER ----
async function refresh() {
  try {
    const res = await fetch(`/api/messages?room=${encodeURIComponent(state.roomId)}`);
    const data = await res.json();
    if (data.participants) {
      $("room-participants").textContent = " · " + data.participants.map((p) => p.name || p.roleLabel).join(" & ");
    }
    if (data.messages && data.messages.length !== state.lastCount) {
      state.lastCount = data.messages.length;
      renderMessages(data.messages);
    }
  } catch {}
}

function renderMessages(messages) {
  const box = $("messages");
  if (!messages.length) {
    box.innerHTML = `<div class="empty">No messages yet. Say what's on your mind — the mediator will help you say it well.</div>`;
    return;
  }
  box.innerHTML = messages.map((m) => {
    const me = m.sender === state.participantId;
    const tech = (m.techniques || []).map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join("");
    const coach = m.coaching ? `<div class="coach">${escapeHtml(m.coaching)}</div>` : "";
    return `<div class="msg ${me ? "me" : "them"}">
      <div class="who">${escapeHtml(m.roleLabel)}${me ? " (you)" : ""}</div>
      <div class="body">${escapeHtml(m.mediated)}</div>
      ${coach}
      <div class="tech">${tech}</div>
    </div>`;
  }).join("");
  box.scrollTop = box.scrollHeight;
}

function startPolling() {
  if (state.polling) return;
  state.polling = true;
  const tick = () => {
    if (!state.polling) return;
    refresh();
    setTimeout(tick, 1500);
  };
  tick();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---- BOOT ----
(function init() {
  const params = new URLSearchParams(location.search);
  const roomParam = params.get("room");
  if (roomParam) $("join-code").value = roomParam.toUpperCase();

  if (loadSession()) {
    enterRoom();
  } else {
    show("landing");
  }
})();
