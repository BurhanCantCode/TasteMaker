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
4. Review 10 assumptions
5. Vote **Agree** or **Disagree** per card

Votes are sent immediately and also flushed as a final batch once all cards are rated.
After the 10th vote, the extension auto-generates the next stack.

You can drag the panel edge to make it wider if needed.

Optional: open the chat panel and ask follow-up questions about your assumptions.

## Configuration

- Open extension options to set custom API base URL.
- Default API base URL: `http://localhost:3000`

## Required backend endpoints

- `POST /api/assumptions/generate`
- `POST /api/assumptions/feedback`
- `POST /api/assumptions/chat`
