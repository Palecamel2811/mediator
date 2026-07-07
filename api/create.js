import { json, getRoom, setRoom } from "./_lib.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function code(len = 6) {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

function newId() {
  return (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)) ;
}

export const config = { runtime: "edge" };

export default async function handler(request) {
  if (request.method === "OPTIONS") return json({});
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body = {};
  try {
    body = await request.json();
  } catch {}

  const { action, roomId, name } = body;

  // JOIN
  if (action === "join") {
    const room = await getRoom(roomId);
    if (!room) return json({ error: "Room not found" }, 404);
    if (room.participants.length >= 2) return json({ error: "Room is full" }, 409);
    const participantId = newId();
    const roleLabel = "Person B";
    room.participants.push({ id: participantId, name: name || roleLabel, roleLabel });
    await setRoom(room);
    return json({ roomId: room.id, participantId, roleLabel, name: name || roleLabel });
  }

  // CREATE
  const id = code();
  const participantId = newId();
  const roleLabel = "Person A";
  const room = {
    id,
    createdAt: Date.now(),
    participants: [{ id: participantId, name: name || roleLabel, roleLabel }],
    messages: [],
  };
  await setRoom(room);
  return json({ roomId: id, participantId, roleLabel, name: name || roleLabel });
}
