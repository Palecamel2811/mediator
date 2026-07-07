# Mediator — Healthy Communication

A neutral space for hard conversations. Write honestly — even when you're furious — and the
app translates your message into a version that is **true to your meaning but easier for the
other person to hear**. Both people talk *through* the mediator, so the message lands the way
you intended.

## How it works
1. **Person A** creates a room and shares the code/link.
2. **Person B** joins with the code.
3. Either person writes a raw message → clicks **Translate** → the app returns a healthy rewrite,
   a short coaching note, and the techniques it applied.
4. They can edit the rewrite, then **Send**. Both sides see the mediated message in real time
   (polling every 1.5s), with the coaching available per message.

## The science behind the mediation
The mediator is grounded in established interpersonal-communication research, not generic
"be nice" advice:
- **Nonviolent Communication (Marshall Rosenberg)** — Observations, Feelings, Needs, Requests (OFNR).
- **The Gottman Institute** — avoiding the *Four Horsemen* (criticism, contempt, defensiveness,
  stonewalling) and using antidotes such as *I-statements* and a *softened start-up*.
- **Active / reflective listening** and **DBT interpersonal effectiveness (DEAR MAN)** for
  keeping the exchange constructive.

## Tech
- **Frontend:** static HTML/CSS/JS (no build step).
- **Backend:** Vercel serverless functions in `/api` (`create`, `messages`, `mediate`).
- **Real-time:** short-polling (Vercel has no native WebSockets on serverless functions).
- **Storage:** Upstash Redis (Vercel KV) when configured; in-memory fallback for local dev.
- **Mediation:** cloud LLM (OpenAI-compatible) when `LLM_API_KEY` is set; otherwise a
  rule-based fallback so the app still runs.

## Environment variables (set in Vercel → Project → Settings → Environment Variables)
| Variable | Required | Purpose |
| --- | --- | --- |
| `LLM_API_KEY` | recommended | API key for the cloud LLM. Without it, rule-based fallback is used. |
| `LLM_BASE_URL` | optional | OpenAI-compatible base URL (default `https://api.openai.com/v1`). |
| `LLM_MODEL` | optional | Model name (default `gpt-4o-mini`). |
| `UPSTASH_REDIS_REST_URL` | for production | Vercel KV / Upstash Redis REST URL. |
| `UPSTASH_REDIS_REST_TOKEN` | for production | Vercel KV / Upstash Redis REST token. |

Without the Upstash vars the app runs in-memory (fine for local testing, but messages reset on
cold starts and aren't shared across serverless instances).

## Local development
```bash
npm install -g vercel
vercel dev            # serves the app + /api locally
# open the printed localhost URL
```

## Deploy
```bash
vercel                # preview
vercel --prod         # production
```
Add the environment variables above in the Vercel dashboard before going to production so
messages persist (Upstash) and mediation uses the LLM.
