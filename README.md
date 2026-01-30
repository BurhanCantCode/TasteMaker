# Tastemaker

An AI-powered web application that builds comprehensive user preference profiles through dynamic questioning and predictions.

## Features

- 🎯 Dynamic question generation using Claude AI
- 💳 Swipeable Tinder-style card interface
- 🍪 Cookie-based persistence (no login required)
- 📊 Real-time progress tracking
- ⚙️ Customizable AI prompts
- 📱 Mobile-first responsive design

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **React:** 19.2.3
- **Language:** TypeScript 5
- **Styling:** Tailwind CSS v4
- **Animations:** Framer Motion 12.29.2
- **Icons:** Lucide React
- **LLM:** Anthropic Claude API
- **Deployment:** Vercel

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Anthropic API key from [console.anthropic.com](https://console.anthropic.com/)

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Create `.env.local` file:

```env
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
```

4. Run the development server:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000)

## How It Works

1. **ASK Mode:** The AI generates questions to learn about your preferences
2. **Answer:** Swipe or tap to respond (Yes/No, Like/Dislike, etc.)
3. **RESULT Mode:** Based on your answers, the AI predicts things you'd like
4. **Rate:** Swipe to rate the predictions
5. **Repeat:** The cycle continues, refining your profile

### Swipe Gestures

- **Swipe Right:** Yes / Like / Positive
- **Swipe Left:** No / Dislike / Negative
- **Swipe Up:** Super Like / Strong Preference
- **Tap Buttons:** Alternative to swiping

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import project to Vercel
3. Add environment variable:
   - `ANTHROPIC_API_KEY`: Your Anthropic API key
4. Deploy

### Other Platforms

The app is a standard Next.js application and can be deployed to any platform that supports Next.js.

## Project Structure

```
web/
├── app/
│   ├── api/generate/     # Claude API endpoint
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Main page
├── components/
│   ├── cards/            # Card components
│   ├── inputs/           # Input components
│   └── navigation/       # Nav components
├── hooks/                # React hooks
├── lib/                  # Utilities & types
└── .env.local.example    # Environment template
```

## Customization

### Custom System Prompts

Click the gear icon to customize the AI's behavior. You can adapt Tastemaker for:

- Taste profiling (default)
- Medical diagnosis
- Product recommendations
- Custom use cases

### Batch Sizes

Edit `page.tsx` to adjust:
- Questions per batch (default: 10)
- Predictions per batch (default: 5)

## License

MIT

## Credits

Built with Claude, Next.js, and Framer Motion.
