# Wild Magic Assumptions

Chrome extension that generates AI-powered behavioral inferences from your last 90 days of browsing history.

## Structure

```
backend/    Next.js API server (Anthropic Claude + Neon Postgres)
extension/  Chrome Extension (MV3 side panel)
```

## APIs

- `POST /api/assumptions/generate` — generate a configurable batch of assumption cards from browsing history
- `POST /api/assumptions/feedback` — submit agree/disagree votes, updates learning weights
- `POST /api/assumptions/chat` — conversational follow-up grounded in assumptions + patterns

## Run Backend

```bash
cd backend
cp .env.local.example .env
# Fill in ANTHROPIC_API_KEY and DATABASE_URL
npm install
npm run dev
```

Backend runs at `http://localhost:3000`.

## Load Chrome Extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/` folder
5. Click the extension icon to open the side panel
6. Click **Generate**

Set a custom API base URL in extension options if needed.
