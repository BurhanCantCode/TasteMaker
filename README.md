# Tastemaker (Extension-First)

Tastemaker has pivoted from a web card app to a Chrome extension that generates "wild magic assumptions" from the user's last 90 days of browsing history.

## Product Shape

- User-facing surface: Chrome Extension (MV3)
- Backend: Next.js API routes
- LLM: Anthropic Claude (server-side proxy)
- Learning memory: Neon Postgres (`DATABASE_URL`)

## New APIs

- `POST /api/assumptions/generate`
  - Input: `userId`, `windowDays` (default 90), `history[]`
  - Output: `runId`, `generatedAt`, `assumptions[]` (10 cards)
- `POST /api/assumptions/feedback`
  - Input: `userId`, `runId`, `feedback[]` (`agree | disagree`)
  - Output: learning summary (top positive/negative patterns)
- `POST /api/assumptions/chat`
  - Input: `userId`, `message`, optional `runId`
  - Output: conversational reply grounded in recent assumptions + learning patterns

## Environment

Create `.env` (or `.env.local`) with:

```env
ANTHROPIC_API_KEY=your_anthropic_key
DATABASE_URL=postgresql://... # Neon connection string
```

## Run Backend

```bash
npm install
npm run dev
```

Backend runs at `http://localhost:3000` by default.

## Load Chrome Extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `web/extension`
5. Open extension popup and click **Generate**

Optional: set custom API base URL in extension options.

## Repo Notes

- Extension code: `web/extension`
- Assumptions backend modules: `web/lib/assumptions`
- Legacy web UI has been removed. Only the extension and its backend remain.
