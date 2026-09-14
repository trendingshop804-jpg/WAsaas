export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-6 md:p-12 flex flex-col items-center justify-center selection:bg-emerald-500 selection:text-slate-950">
      <div className="w-full max-w-4xl space-y-8">
        
        {/* Header Badge & Title */}
        <div className="space-y-4 text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold tracking-wide uppercase">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            WhatsApp Cloud API Webhook
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            Service Endpoint Ready
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl">
            This microservice handles Meta WhatsApp inbound webhooks, signature verification, and real-time lead sync with Supabase.
          </p>
        </div>

        {/* Status Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm hover:border-slate-700 transition-all">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Endpoint URL</div>
            <div className="font-mono text-sm text-emerald-400 font-semibold truncate">/api/webhook</div>
            <div className="text-xs text-slate-500 mt-2">Accepts GET (verify) & POST (messages)</div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm hover:border-slate-700 transition-all">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Verification Protocol</div>
            <div className="font-mono text-sm text-sky-400 font-semibold">HMAC SHA-256</div>
            <div className="text-xs text-slate-500 mt-2">Validates X-Hub-Signature-256</div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm hover:border-slate-700 transition-all">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Database Connection</div>
            <div className="font-mono text-sm text-purple-400 font-semibold">Supabase Service Role</div>
            <div className="text-xs text-slate-500 mt-2">Bypasses RLS for server-side updates</div>
          </div>
        </div>

        {/* Setup Card */}
        <div className="p-6 md:p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl space-y-6">
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 text-sm">
              🚀
            </span>
            Meta Developer Console Instructions
          </h2>

          <ol className="space-y-4 text-sm text-slate-300">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 font-mono text-xs text-emerald-400 bg-slate-800 px-2 py-1 rounded">1</span>
              <span>Navigate to <strong className="text-slate-100">Meta Developer Portal &gt; Your App &gt; WhatsApp &gt; Configuration</strong>.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 font-mono text-xs text-emerald-400 bg-slate-800 px-2 py-1 rounded">2</span>
              <span>Set <strong>Callback URL</strong> to: <code className="bg-slate-800 text-emerald-300 px-2 py-1 rounded font-mono text-xs">https://your-vercel-domain.vercel.app/api/webhook</code></span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 font-mono text-xs text-emerald-400 bg-slate-800 px-2 py-1 rounded">3</span>
              <span>Set <strong>Verify Token</strong> to match your Vercel environment variable: <code className="bg-slate-800 text-emerald-300 px-2 py-1 rounded font-mono text-xs">WEBHOOK_VERIFY_TOKEN</code></span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 font-mono text-xs text-emerald-400 bg-slate-800 px-2 py-1 rounded">4</span>
              <span>Subscribe to fields: <strong className="text-slate-100">messages</strong>.</span>
            </li>
          </ol>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-800/80 flex flex-col md:flex-row justify-between items-center text-xs text-slate-500 gap-2">
          <div>WAsaas WhatsApp Cloud Webhook Integration</div>
          <div className="flex items-center gap-4">
            <span className="hover:text-slate-400 transition-colors">App Router v16</span>
            <span>•</span>
            <span className="hover:text-slate-400 transition-colors">Supabase JS</span>
          </div>
        </div>

      </div>
    </div>
  );
}
