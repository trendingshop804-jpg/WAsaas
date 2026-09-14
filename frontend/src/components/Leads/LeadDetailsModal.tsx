import React, { useState, useEffect } from 'react';
import { Lead, FollowUpMessage, FollowUpStage, MessageTone } from '../../types';
import {
  X,
  User,
  Phone,
  Mail,
  Building,
  Tag,
  Clock,
  CheckCircle,
  FileText,
  MessageSquare,
  Send,
  History,
  Copy,
  Check,
  Calendar,
  Compass,
} from 'lucide-react';
import {
  generateFollowUpMessage,
  buildWhatsAppUrl,
  buildMailtoUrl,
  fetchFollowUpMessages,
  saveFollowUpMessage,
} from '../../lib/messages';

interface LeadDetailsModalProps {
  isOpen: boolean;
  lead: Lead | null;
  onClose: () => void;
  onEditLead: (lead: Lead) => void;
  onMarkContacted: (lead: Lead) => void;
  onShowToast: (title: string, description?: string, type?: 'success' | 'error' | 'info') => void;
}

export const LeadDetailsModal: React.FC<LeadDetailsModalProps> = ({
  isOpen,
  lead,
  onClose,
  onEditLead,
  onMarkContacted,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'generator' | 'history'>('overview');
  
  // Generator State
  const [stage, setStage] = useState<FollowUpStage>('First Follow-up');
  const [tone, setTone] = useState<MessageTone>('Professional');
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [copied, setCopied] = useState(false);

  // History State
  const [history, setHistory] = useState<FollowUpMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (lead) {
      const msg = generateFollowUpMessage(lead, stage, tone);
      setGeneratedMessage(msg);
    }
  }, [lead, stage, tone]);

  useEffect(() => {
    if (isOpen && lead) {
      loadHistory();
    }
  }, [isOpen, lead, activeTab]);

  const loadHistory = async () => {
    if (!lead) return;
    setLoadingHistory(true);
    const msgs = await fetchFollowUpMessages(lead.id);
    setHistory(msgs);
    setLoadingHistory(false);
  };

  if (!isOpen || !lead) return null;

  const handleCopy = async () => {
    if (!generatedMessage) return;
    try {
      await navigator.clipboard.writeText(generatedMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onShowToast('Message Copied!', 'Copied to clipboard and saved to lead history.', 'success');

      await saveFollowUpMessage({
        lead_id: lead.id,
        message: generatedMessage,
        stage,
        channel: 'copied',
      });
      loadHistory();
    } catch (e) {
      onShowToast('Copy Failed', 'Unable to copy text.', 'error');
    }
  };

  const handleWhatsApp = async () => {
    if (!lead.phone || !generatedMessage) return;
    const url = buildWhatsAppUrl(lead.phone, generatedMessage);
    window.open(url, '_blank');
    onShowToast('Opening WhatsApp', 'WhatsApp chat opened.', 'info');

    await saveFollowUpMessage({
      lead_id: lead.id,
      message: generatedMessage,
      stage,
      channel: 'whatsapp',
    });
    loadHistory();
  };

  const handleEmail = async () => {
    if (!lead.email || !generatedMessage) return;
    const subject = `Follow-up for ${lead.name}`;
    const url = buildMailtoUrl(lead.email, subject, generatedMessage);
    window.location.href = url;
    onShowToast('Opening Email Client', 'Draft created in mail app.', 'info');

    await saveFollowUpMessage({
      lead_id: lead.id,
      message: generatedMessage,
      stage,
      channel: 'email',
    });
    loadHistory();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl relative my-8">
        {/* Top Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-brand-600/20 border border-brand-500/30 text-brand-400 font-bold flex items-center justify-center text-lg uppercase">
              {lead.name.charAt(0)}
            </div>
            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                {lead.name}
                <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-300">
                  {lead.status}
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {lead.company ? `${lead.company} • ` : ''}Added {new Date(lead.created_at || '').toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onEditLead(lead)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white border border-slate-700 transition-colors"
            >
              Edit Lead
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 mt-4 border-b border-slate-800">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'overview'
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Overview & Schedule
          </button>

          <button
            onClick={() => setActiveTab('generator')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'generator'
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Generate Message</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Message History ({history.length})</span>
          </button>
        </div>

        {/* Tab 1: Overview */}
        {activeTab === 'overview' && (
          <div className="mt-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Contact Information */}
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Contact Details
                </h4>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-slate-300">
                    <Phone className="w-4 h-4 text-brand-400 flex-shrink-0" />
                    <span className="font-mono">{lead.phone || 'No phone number'}</span>
                  </div>

                  <div className="flex items-center gap-2 text-slate-300">
                    <Mail className="w-4 h-4 text-brand-400 flex-shrink-0" />
                    <span>{lead.email || 'No email address'}</span>
                  </div>

                  <div className="flex items-center gap-2 text-slate-300">
                    <Building className="w-4 h-4 text-brand-400 flex-shrink-0" />
                    <span>{lead.company || 'No company specified'}</span>
                  </div>

                  <div className="flex items-center gap-2 text-slate-300">
                    <Compass className="w-4 h-4 text-brand-400 flex-shrink-0" />
                    <span>Source: {lead.source || 'Direct'}</span>
                  </div>
                </div>
              </div>

              {/* Follow-up Schedule & Interest */}
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Follow-up Status & Interest
                </h4>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Interested In:</span>
                    <span className="font-semibold text-white">{lead.interested_in || 'N/A'}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Next Follow-up:</span>
                    <span className="font-semibold text-amber-400">{lead.next_follow_up_date || 'Not scheduled'}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Last Contacted:</span>
                    <span className="text-slate-300">
                      {lead.last_contacted_at ? new Date(lead.last_contacted_at).toLocaleString() : 'Never'}
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => onMarkContacted(lead)}
                    className="w-full py-2 px-3 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white text-xs font-semibold border border-emerald-500/30 transition-all flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>Mark as Contacted Now</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Notes Section */}
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Notes & Discussion History
              </h4>
              <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                {lead.notes || 'No notes added for this lead yet.'}
              </p>
            </div>
          </div>
        )}

        {/* Tab 2: Generator */}
        {activeTab === 'generator' && (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Stage</label>
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value as FollowUpStage)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                >
                  <option value="First Follow-up">First Follow-up</option>
                  <option value="Second Follow-up">Second Follow-up</option>
                  <option value="Final Follow-up">Final Follow-up</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Tone</label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value as MessageTone)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                >
                  <option value="Professional">Professional</option>
                  <option value="Friendly">Friendly</option>
                  <option value="Short Sales">Short Sales</option>
                  <option value="Polite">Polite</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Generated Message Text
              </label>
              <textarea
                rows={5}
                value={generatedMessage}
                onChange={(e) => setGeneratedMessage(e.target.value)}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white leading-relaxed resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              {lead.phone && (
                <button
                  onClick={handleWhatsApp}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>WhatsApp</span>
                </button>
              )}
              {lead.email && (
                <button
                  onClick={handleEmail}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <Mail className="w-4 h-4" />
                  <span>Email</span>
                </button>
              )}
              <button
                onClick={handleCopy}
                className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied!' : 'Copy Message'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: History */}
        {activeTab === 'history' && (
          <div className="mt-5 space-y-3">
            {loadingHistory ? (
              <div className="text-center py-8 text-xs text-slate-400">Loading history...</div>
            ) : history.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-slate-800 rounded-xl">
                No follow-up messages recorded for this lead yet.
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {history.map((h) => (
                  <div key={h.id} className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-1">
                    <div className="flex items-center justify-between text-slate-400 text-[11px]">
                      <span className="font-semibold text-slate-300">
                        {h.stage || 'Follow-up'} • <span className="uppercase text-brand-400">{h.channel}</span>
                      </span>
                      <span>{new Date(h.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-slate-200 italic font-sans">{h.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
