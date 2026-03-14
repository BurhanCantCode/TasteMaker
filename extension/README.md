# TasteMaker Chrome Extension (MV3)

## Load unpacked

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click **Load unpacked**
4. Select this folder: `web/extension`

## Usage

1. Click the extension icon
2. Chrome opens the TasteMaker side panel on the right
3. Click **Generate**
4. Review the first 10 assumptions
5. Vote **Agree** or **Disagree** per card

Votes are queued per source run, sent immediately when possible, and kept in local storage until background sync succeeds.
After 5 ratings, the extension starts warming the next 5 cards in the background so the queue can keep rolling without a hard stop.
Recently generated assumptions are filtered to reduce repeats across the active session and recent runs.

You can drag the panel edge to make it wider if needed.

Optional: open the chat panel and ask follow-up questions about your assumptions.

## Configuration

- Open extension options to set custom API base URL.
- Default API base URL: `http://localhost:3000`

## Required backend endpoints

- `POST /api/assumptions/generate`
- `POST /api/assumptions/feedback`
- `POST /api/assumptions/chat`
