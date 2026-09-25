import React, { useState, useEffect } from 'react';
import { Lead, FollowUpStage, MessageTone } from '../../types';
import {
  X,
  Sparkles,
  Copy,
  MessageSquare,
  Mail,
  Check,
  Send,
  History,
} from 'lucide-react';
import {
  generateFollowUpMessage,
  buildWhatsAppUrl,
  buildMailtoUrl,
  saveFollowUpMessage,
} from '../../lib/messages';

interface MessageGeneratorModalProps {
  isOpen: boolean;
  leads: Lead[];
  selectedLead?: Lead | null;
  defaultTone?: MessageTone;
  onClose: () => void;
  onShowToast: (title: string, description?: string, type?: 'success' | 'error' | 'info') => void;
  onMessageSaved?: () => void;
}

export const MessageGeneratorModal: React.FC<MessageGeneratorModalProps> = ({
  isOpen,
  leads,
  selectedLead,
  defaultTone = 'Professional',
  onClose,
  onShowToast,
  onMessageSaved,
}) => {
  const [activeLeadId, setActiveLeadId] = useState<string>('');
  const [stage, setStage] = useState<FollowUpStage>('First Follow-up');
  const [tone, setTone] = useState<MessageTone>(defaultTone);
  const [generatedMessage, setGeneratedMessage] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    if (selectedLead) {
      setActiveLeadId(selectedLead.id);
    } else if (leads.length > 0) {
      setActiveLeadId(leads[0].id);
    }
  }, [selectedLead, leads, isOpen]);

  const currentLead = leads.find((l) => l.id === activeLeadId) || selectedLead || null;

  // Re-generate message whenever currentLead, stage, or tone changes
  useEffect(() => {
    if (currentLead) {
      const msg = generateFollowUpMessage(currentLead, stage, tone);
      setGeneratedMessage(msg);
      setCopied(false);
    } else {
      setGeneratedMessage('');
    }
  }, [activeLeadId, stage, tone, currentLead]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    if (!generatedMessage) return;
    try {
      await navigator.clipboard.writeText(generatedMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onShowToast('Message Copied!', 'Copied to clipboard and saved to history.', 'success');

      // Save to history
      if (currentLead) {
        setIsSaving(true);
        await saveFollowUpMessage({
          lead_id: currentLead.id,
          message: generatedMessage,
          stage,
          channel: 'copied',
        });
        setIsSaving(false);
        if (onMessageSaved) onMessageSaved();
      }
    } catch (err) {
      onShowToast('Copy Failed', 'Please copy the message manually.', 'error');
    }
  };

  const handleOpenWhatsApp = async () => {
    if (!currentLead?.phone || !generatedMessage) return;
    const url = buildWhatsAppUrl(currentLead.phone, generatedMessage);
    window.open(url, '_blank');
    onShowToast('Opening WhatsApp', 'WhatsApp chat opened. Message saved to history.', 'info');

    // Save to history
    setIsSaving(true);
    await saveFollowUpMessage({
      lead_id: currentLead.id,
      message: generatedMessage,
      stage,
      channel: 'whatsapp',
    });
    setIsSaving(false);
    if (onMessageSaved) onMessageSaved();
  };

  const handleSendEmail = async () => {
    if (!currentLead?.email || !generatedMessage) return;
    const subject = `Follow-up regarding ${currentLead.interested_in || 'our conversation'}`;
    const url = buildMailtoUrl(currentLead.email, subject, generatedMessage);
    window.location.href = url;
    onShowToast('Opening Mail Client', 'Draft opened in email client. Saved to history.', 'info');

    // Save to history
    setIsSaving(true);
    await saveFollowUpMessage({
      lead_id: currentLead.id,
      message: generatedMessage,
      stage,
      channel: 'email',
    });
    setIsSaving(false);
    if (onMessageSaved) onMessageSaved();
  };

  const stages: FollowUpStage[] = ['First Follow-up', 'Second Follow-up', 'Final Follow-up'];
  const tones: MessageTone[] = ['Professional', 'Friendly', 'Short Sales', 'Polite'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Follow-up Message Generator</h3>
              <p className="text-xs text-slate-400">
                Generate personalized follow-up messages instantly for your leads
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {/* Select Lead */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Select Lead
            </label>
            <select
              value={activeLeadId}
              onChange={(e) => setActiveLeadId(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-brand-500 transition-all"
            >
              {leads.length === 0 ? (
                <option value="">No leads available</option>
              ) : (
                leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} {l.company ? `(${l.company})` : ''} — {l.phone || l.email || 'No contact'}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Select Stage & Tone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Follow-up Stage
              </label>
              <div className="grid grid-cols-1 gap-1.5">
                {stages.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStage(st)}
                    className={`px-3 py-2 rounded-xl text-xs font-medium text-left transition-all border ${
                      stage === st
                        ? 'bg-brand-600/20 text-brand-300 border-brand-500/40 shadow-sm'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Tone & Personality
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {tones.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTone(t)}
                    className={`px-3 py-2 rounded-xl text-xs font-medium text-center transition-all border ${
                      tone === t
                        ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40 shadow-sm'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Editable Generated Message Box */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Generated Message (Editable)
              </label>
              <span className="text-[10px] text-slate-400">
                Feel free to make last-minute edits before sending
              </span>
            </div>
            <textarea
              rows={5}
              value={generatedMessage}
              onChange={(e) => setGeneratedMessage(e.target.value)}
              placeholder="Select a lead to generate message..."
              className="w-full p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all font-sans leading-relaxed resize-none"
            />
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {currentLead?.phone && (
                <button
                  type="button"
                  onClick={handleOpenWhatsApp}
                  disabled={!generatedMessage}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-lg shadow-emerald-600/25 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>WhatsApp</span>
                </button>
              )}

              {currentLead?.email && (
                <button
                  type="button"
                  onClick={handleSendEmail}
                  disabled={!generatedMessage}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-lg shadow-blue-600/25 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  <Mail className="w-4 h-4" />
                  <span>Email</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                disabled={!generatedMessage || isSaving}
                className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs shadow-lg shadow-brand-600/25 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied & Saved!' : 'Copy Message'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
