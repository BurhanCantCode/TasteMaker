export default function Home() {
  return (
    <main className="min-h-screen bg-[#f3f4f6] flex items-center justify-center p-6">
      <section className="w-full max-w-2xl rounded-[28px] bg-white p-8 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
          Wild Magic Assumptions
        </p>
        <h1 className="mt-3 text-3xl font-bold text-[#171717] tracking-tight">
          Chrome Extension Backend
        </h1>
        <p className="mt-4 text-base text-gray-600 leading-relaxed">
          This server powers the Wild Magic Assumptions Chrome extension. Install the extension to generate AI-powered behavioral inferences from your browsing history.
        </p>
        <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 space-y-2">
          <p>
            Extension path:
            <code className="ml-2 rounded bg-white px-2 py-1">web/extension</code>
          </p>
          <p>
            API endpoints:
            <code className="ml-2 rounded bg-white px-2 py-1">/api/assumptions/generate</code>
            <code className="ml-2 rounded bg-white px-2 py-1">/api/assumptions/feedback</code>
            <code className="ml-2 rounded bg-white px-2 py-1">/api/assumptions/chat</code>
          </p>
        </div>
      </section>
    </main>
  );
}
