import { json, getRoom, mediate } from "./_lib.js";

export const config = { runtime: "nodejs" };

export default async function handler(request) {
  if (request.method === "OPTIONS") return json({});
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body = {};
  try {
    body = await request.json();
  } catch {}
  const { raw, roomId } = body;
  if (!raw || !String(raw).trim()) return json({ error: "raw text required" }, 400);

  let context = [];
  if (roomId) {
    const room = await getRoom(roomId);
    if (room) context = room.messages;
  }

  const result = await mediate(String(raw).trim(), context);
  return json(result);
}
