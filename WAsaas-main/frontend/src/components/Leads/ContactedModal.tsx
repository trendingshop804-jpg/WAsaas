import React, { useState, useEffect } from 'react';
import { Lead, LeadStatus } from '../../types';
import { X, CheckCircle, Calendar, Clock } from 'lucide-react';

interface ContactedModalProps {
  isOpen: boolean;
  lead: Lead | null;
  onClose: () => void;
  onConfirm: (leadId: string, nextFollowUpDate?: string, newStatus?: LeadStatus) => Promise<void>;
  defaultIntervalDays?: number;
}

export const ContactedModal: React.FC<ContactedModalProps> = ({
  isOpen,
  lead,
  onClose,
  onConfirm,
  defaultIntervalDays = 3,
}) => {
  const [nextDate, setNextDate] = useState('');
  const [status, setStatus] = useState<LeadStatus>('Contacted');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && lead) {
      // Calculate date in defaultIntervalDays
      const d = new Date();
      d.setDate(d.getDate() + defaultIntervalDays);
      setNextDate(d.toISOString().split('T')[0]);
      setStatus(lead.status === 'New' ? 'Contacted' : lead.status);
    }
  }, [isOpen, lead, defaultIntervalDays]);

  if (!isOpen || !lead) return null;

  const handleQuickAddDays = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setNextDate(d.toISOString().split('T')[0]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await onConfirm(lead.id, nextDate || undefined, status);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          disabled={loading}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
          <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Mark as Contacted</h3>
            <p className="text-xs text-slate-400">Record interaction for {lead.name}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <p className="text-xs text-slate-300">
            This will record <strong>{lead.name}</strong> as contacted right now and schedule the next follow-up date.
          </p>

          {/* Quick Date Presets */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Quick Schedule Next Follow-up:
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: '+2 Days', days: 2 },
                { label: '+3 Days', days: 3 },
                { label: '+1 Week', days: 7 },
                { label: '+2 Weeks', days: 14 },
              ].map((btn) => (
                <button
                  key={btn.label}
                  type="button"
                  onClick={() => handleQuickAddDays(btn.days)}
                  className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-medium text-slate-300 hover:text-white transition-colors"
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* Next Follow-up Date Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Next Follow-up Date
            </label>
            <div className="relative flex items-center">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                type="date"
                value={nextDate}
                onChange={(e) => setNextDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
              />
            </div>
          </div>

          {/* Updated Status */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Update Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as LeadStatus)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-brand-500 transition-all"
            >
              <option value="Contacted">Contacted</option>
              <option value="Follow-up">Follow-up</option>
              <option value="Interested">Interested</option>
              <option value="Won">Won</option>
              <option value="Lost">Lost</option>
            </select>
          </div>

          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-2"
            >
              {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              <span>Save & Update</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
