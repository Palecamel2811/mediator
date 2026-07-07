// Shared backend helpers: storage + LLM mediation.
// Storage: Upstash Redis REST (Vercel KV) when configured, else in-memory.
// LLM: OpenAI-compatible endpoint when LLM_API_KEY is set, else rule-based fallback.

const MEMORY = new Map();

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      ...extra,
    },
  });
}

async function getRoom(id) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    const res = await fetch(`${url}/get/${encodeURIComponent("room:" + id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  }
  const v = MEMORY.get("room:" + id);
  return v ? JSON.parse(v) : null;
}

async function setRoom(room) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const payload = JSON.stringify(room);
  if (url && token) {
    await fetch(
      `${url}/set/${encodeURIComponent("room:" + room.id)}/${encodeURIComponent(payload)}`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` } }
    );
    return;
  }
  MEMORY.set("room:" + room.id, payload);
}

const SYSTEM_PROMPT = `You are "The Mediator", an AI communication coach grounded in evidence-based interpersonal communication research:
- Nonviolent Communication (Marshall Rosenberg): Observations, Feelings, Needs, Requests (OFNR).
- The Gottman Institute: avoid the "Four Horsemen" (criticism, contempt, defensiveness, stonewalling) and use antidotes such as "I" statements and a softened start-up.
- Active / reflective listening and DBT interpersonal effectiveness (DEAR MAN).

Your job: take a person's raw, possibly angry message and rewrite it as a healthier version that:
- Preserves the person's authentic underlying meaning, needs, and intent (do NOT sanitize away their point).
- Converts blame and "you" accusations into "I" statements expressing feeling + need + a concrete, doable request.
- Removes contempt, insults, absolutes ("always"/"never"), and sarcasm; uses a softened start-up.
- Invites dialogue rather than escalating; stays close to the original length and natural human tone.

Respond with ONLY a JSON object of this exact shape:
{
  "mediated": "<the healthy rewrite>",
  "coaching": "<1-3 sentences explaining the key change and its basis, e.g. NVC / I-statements / softened start-up>",
  "techniques": ["<short label>", "..."]
}`;

async function callLLM(raw, context) {
  const key = process.env.LLM_API_KEY;
  if (!key) return null;

  const base = (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.LLM_MODEL || "gpt-4o-mini";

  const recent = (context || [])
    .slice(-6)
    .map((m) => `${m.roleLabel}: ${m.mediated}`)
    .join("\n");

  const userContent = recent
    ? `Recent conversation (already mediated):\n${recent}\n\nNow mediate this raw message from ${context.length ? context[context.length - 1].roleLabel : "a participant"}:\n"${raw}"`
    : `Mediate this raw message:\n"${raw}"`;

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!res.ok) throw new Error(`LLM error ${res.status}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  return JSON.parse(content);
}

// Rule-based fallback used when no LLM key is configured.
function fallbackMediate(raw) {
  let text = raw.trim();
  const techniques = [];
  const lower = text.toLowerCase();

  // Strip all-caps yelling.
  if (text === text.toUpperCase() && text.length > 3) {
    text = text.charAt(0) + text.slice(1).toLowerCase();
    techniques.push("Calmed all-caps tone");
  }

  // "You always / you never" -> "I often feel"
  const blame = text.match(/\byou\s+(always|never)\b/i);
  if (blame) {
    text = text.replace(/\byou\s+(always|never)\b/i, "I feel like this $1 happens");
    techniques.push("Blame → I-statement");
  }

  // Replace "you" accusations at sentence starts with "I feel"
  text = text.replace(/\b(you)\s+(made|make|are|were|did|don't|dont|do not)\b/i, "I feel that you $2");
  if (/\b(you)\b/i.test(text) && techniques.length === 0) {
    techniques.push("Softened start-up");
  }

  // Remove obvious insults (very small list to stay safe).
  const insults = [/\bstupid\b/i, /\bidiot\b/i, /\bshut up\b/i, /\bhate you\b/i];
  if (insults.some((r) => r.test(text))) {
    text = text.replace(/\bstupid\b/i, "confused").replace(/\bidiot\b/i, "person").replace(/\bshut up\b/i, "please listen").replace(/\bhate you\b/i, "am hurt by this");
    techniques.push("Removed contempt");
  }

  // Add a gentle closing request if none present.
  if (!/[?]\s*$/.test(text) && !/\b(please|could you|would you|can we)\b/i.test(text)) {
    text += " — can we talk about this when we're both ready?";
    techniques.push("Added request");
  }

  return {
    mediated: text,
    coaching:
      "Fallback (no LLM key set). Used I-statements and a softened start-up to reduce blame and invite dialogue — core Gottman/NVC techniques.",
    techniques: techniques.length ? techniques : ["Softened start-up"],
  };
}

async function mediate(raw, context) {
  try {
    const r = await callLLM(raw, context);
    if (r && r.mediated) return r;
  } catch (e) {
    // fall through to rule-based
  }
  return fallbackMediate(raw);
}

export { json, getRoom, setRoom, mediate };
