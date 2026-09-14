export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-6 md:p-12 flex flex-col items-center justify-center selection:bg-emerald-500 selection:text-slate-950">
      <div className="w-full max-w-4xl space-y-8">
        
        {/* Header Badge & Title */}
        <div className="space-y-4 text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold tracking-wide uppercase">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            WhatsApp Cloud API & SaaS Dashboard
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            Service Endpoint & App Ready
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl">
            Your WhatsApp integration microservice is online and synchronized with your main SaaS application.
          </p>

          {/* Direct Link to Main Software */}
          <div className="pt-2">
            <a 
              href="/index.html" 
              className="inline-flex items-center gap-3 px-6 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-base shadow-lg shadow-emerald-500/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>🚀 Open Main Software Dashboard</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
          </div>
        </div>

        {/* Status Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm hover:border-slate-700 transition-all">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Webhook Endpoint</div>
            <div className="font-mono text-sm text-emerald-400 font-semibold truncate">/api/webhook</div>
            <div className="text-xs text-slate-500 mt-2">Accepts GET & POST messages</div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm hover:border-slate-700 transition-all">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Main SaaS App</div>
            <div className="font-mono text-sm text-sky-400 font-semibold truncate">/index.html</div>
            <div className="text-xs text-slate-500 mt-2">Full CRM & WhatsApp Portal</div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm hover:border-slate-700 transition-all">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Database Connection</div>
            <div className="font-mono text-sm text-purple-400 font-semibold">Supabase Service Role</div>
            <div className="text-xs text-slate-500 mt-2">Real-time Lead Sync</div>
          </div>
        </div>

        {/* Setup Card */}
        <div className="p-6 md:p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl space-y-6">
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 text-sm">
              ⚙️
            </span>
            Vercel Root Directory Explanation
          </h2>

          <div className="space-y-3 text-sm text-slate-300">
            <p>
              If you want the domain to open the <strong>Main SaaS Dashboard (`index.html`) directly</strong> when visiting the home URL:
            </p>
            <ol className="space-y-2 pl-4 list-decimal text-slate-400">
              <li>Go to <strong>Vercel Dashboard &gt; Settings &gt; General</strong>.</li>
              <li>Set <strong>Root Directory</strong> to <code className="bg-slate-800 text-emerald-300 px-2 py-0.5 rounded font-mono text-xs">.</code> (Root folder) instead of <code className="bg-slate-800 text-emerald-300 px-2 py-0.5 rounded font-mono text-xs">whatsapp-webhook</code>.</li>
              <li>Redeploy. This will make your main software (`index.html`) load automatically on the main domain!</li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-800/80 flex flex-col md:flex-row justify-between items-center text-xs text-slate-500 gap-2">
          <div>WAsaas Cloud Platform</div>
          <div className="flex items-center gap-4">
            <a href="/index.html" className="text-emerald-400 hover:underline">Go to Main App</a>
          </div>
        </div>

      </div>
    </div>
  );
}
