import React, { useState } from 'react';
import { Copy, Check, FileText, Sparkles, Send } from 'lucide-react';
import { MessageTone, FollowUpStage } from '../../types';
import { generateFollowUpMessage } from '../../lib/messages';

interface MessageTemplatesViewProps {
  onOpenGenerator: () => void;
  onShowToast: (title: string, description?: string, type?: 'success' | 'error' | 'info') => void;
}

export const MessageTemplatesView: React.FC<MessageTemplatesViewProps> = ({
  onOpenGenerator,
  onShowToast,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const sampleLead = {
    name: 'Alex Johnson',
    company: 'NexusTech',
    interested_in: 'CRM Automation OS',
  };

  const stages: FollowUpStage[] = ['First Follow-up', 'Second Follow-up', 'Final Follow-up'];
  const tones: MessageTone[] = ['Professional', 'Friendly', 'Short Sales', 'Polite'];

  const handleCopyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      onShowToast('Template Copied!', 'Message template copied to clipboard.', 'success');
    } catch (e) {
      onShowToast('Copy Failed', 'Unable to copy text.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-brand-900/60 to-indigo-900/60 border border-brand-500/30 flex items-center justify-between shadow-xl">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-400" />
            Standard Follow-up Message Templates
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-xl">
            Explore ready-to-use message templates for different follow-up stages and tone styles. Personalized automatically with lead information.
          </p>
        </div>

        <button
          onClick={onOpenGenerator}
          className="px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs shadow-lg transition-all flex items-center gap-2"
        >
          <Send className="w-4 h-4" />
          <span>Launch Generator</span>
        </button>
      </div>

      {/* Grid of Stages */}
      <div className="space-y-8">
        {stages.map((stage) => (
          <div key={stage} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
              <FileText className="w-5 h-5 text-brand-400" />
              <h3 className="text-base font-bold text-white">{stage} Templates</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tones.map((tone) => {
                const text = generateFollowUpMessage(sampleLead, stage, tone);
                const cardId = `${stage}-${tone}`;
                const isCopied = copiedId === cardId;

                return (
                  <div
                    key={cardId}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col justify-between space-y-3 hover:border-slate-700 transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                          {tone} Tone
                        </span>
                        <span className="text-[10px] text-slate-400">Sample Preview</span>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed font-sans">{text}</p>
                    </div>

                    <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">Replaces &#123;name&#125;, &#123;company&#125;</span>
                      <button
                        onClick={() => handleCopyText(cardId, text)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 hover:text-white transition-all flex items-center gap-1.5"
                      >
                        {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{isCopied ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
