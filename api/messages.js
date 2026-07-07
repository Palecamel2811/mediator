import { json, getRoom, setRoom, mediate } from "./_lib.js";

export const config = { runtime: "edge" };

function publicView(room) {
  return {
    roomId: room.id,
    participants: room.participants.map((p) => ({ roleLabel: p.roleLabel, name: p.name })),
    messages: room.messages.map((m) => ({
      id: m.id,
      ts: m.ts,
      sender: m.sender,
      roleLabel: m.roleLabel,
      mediated: m.mediated,
      coaching: m.coaching,
      techniques: m.techniques,
    })),
  };
}

export default async function handler(request) {
  if (request.method === "OPTIONS") return json({});
  const url = new URL(request.url);

  // GET ?room=ID&since=TS
  if (request.method === "GET") {
    const roomId = url.searchParams.get("room");
    if (!roomId) return json({ error: "room required" }, 400);
    const room = await getRoom(roomId);
    if (!room) return json({ error: "Room not found" }, 404);
    return json(publicView(room));
  }

  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body = {};
  try {
    body = await request.json();
  } catch {}
  const { roomId, participantId, raw, mediated } = body;
  if (!roomId || !participantId) return json({ error: "roomId and participantId required" }, 400);

  const room = await getRoom(roomId);
  if (!room) return json({ error: "Room not found" }, 404);
  const participant = room.participants.find((p) => p.id === participantId);
  if (!participant) return json({ error: "Not a participant" }, 403);

  const context = room.messages;
  const result = mediated && String(mediated).trim()
    ? { mediated: String(mediated).trim() }
    : await mediate(raw || "", context);

  const message = {
    id: (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)),
    ts: Date.now(),
    sender: participant.id,
    roleLabel: participant.roleLabel,
    raw: raw || "",
    mediated: result.mediated,
    coaching: result.coaching || "",
    techniques: result.techniques || [],
  };
  room.messages.push(message);
  await setRoom(room);

  return json({
    id: message.id,
    ts: message.ts,
    sender: message.sender,
    roleLabel: message.roleLabel,
    mediated: message.mediated,
    coaching: message.coaching,
    techniques: message.techniques,
  });
}
