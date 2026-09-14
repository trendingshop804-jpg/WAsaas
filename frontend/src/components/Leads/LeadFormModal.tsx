import React, { useState, useEffect } from 'react';
import { Lead, LeadStatus } from '../../types';
import { X, User, Phone, Mail, Building, Tag, FileText, Calendar, Compass } from 'lucide-react';

interface LeadFormModalProps {
  isOpen: boolean;
  leadToEdit?: Lead | null;
  onClose: () => void;
  onSubmit: (leadData: Omit<Lead, 'id' | 'created_at' | 'updated_at'>, isEdit: boolean, leadId?: string) => Promise<void>;
  defaultIntervalDays?: number;
}

export const LeadFormModal: React.FC<LeadFormModalProps> = ({
  isOpen,
  leadToEdit,
  onClose,
  onSubmit,
  defaultIntervalDays = 3,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [source, setSource] = useState('Website');
  const [interestedIn, setInterestedIn] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<LeadStatus>('New');
  const [followUpDate, setFollowUpDate] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (leadToEdit) {
      setName(leadToEdit.name || '');
      setPhone(leadToEdit.phone || '');
      setEmail(leadToEdit.email || '');
      setCompany(leadToEdit.company || '');
      setSource(leadToEdit.source || 'Website');
      setInterestedIn(leadToEdit.interested_in || '');
      setNotes(leadToEdit.notes || '');
      setStatus(leadToEdit.status || 'New');
      setFollowUpDate(leadToEdit.next_follow_up_date || leadToEdit.follow_up_date || '');
    } else {
      // Default new lead values
      setName('');
      setPhone('');
      setEmail('');
      setCompany('');
      setSource('Website');
      setInterestedIn('');
      setNotes('');
      setStatus('New');
      
      // Calculate default follow-up date (today + defaultIntervalDays)
      const d = new Date();
      d.setDate(d.getDate() + defaultIntervalDays);
      setFollowUpDate(d.toISOString().split('T')[0]);
    }
    setErrorMsg('');
  }, [leadToEdit, isOpen, defaultIntervalDays]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Lead Name is required.');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg('');

      const leadData = {
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        company: company.trim() || undefined,
        source: source.trim() || 'Website',
        interested_in: interestedIn.trim() || undefined,
        notes: notes.trim() || undefined,
        status,
        follow_up_date: followUpDate || undefined,
        next_follow_up_date: followUpDate || undefined,
      };

      await onSubmit(leadData, !!leadToEdit, leadToEdit?.id);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred while saving the lead.');
    } finally {
      setLoading(false);
    }
  };

  const sources = [
    'Website',
    'Referral',
    'Cold Call',
    'WhatsApp',
    'Social Media',
    'Email Campaign',
    'Event/Exhibition',
    'Other',
  ];

  const statuses: LeadStatus[] = ['New', 'Contacted', 'Interested', 'Follow-up', 'Won', 'Lost'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-lg font-bold text-white">
              {leadToEdit ? 'Edit Lead' : 'Add New Lead'}
            </h3>
            <p className="text-xs text-slate-400">
              {leadToEdit ? 'Update details and follow-up schedule for this lead' : 'Enter lead contact information and follow-up schedule'}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Message Alert */}
        {errorMsg && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium">
            {errorMsg}
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Lead Name <span className="text-rose-400">*</span>
              </label>
              <div className="relative flex items-center">
                <User className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Phone Number</label>
              <div className="relative flex items-center">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +1 555 123 4567"
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all font-mono"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email Address</label>
              <div className="relative flex items-center">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@example.com"
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                />
              </div>
            </div>

            {/* Company */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Company / Organization</label>
              <div className="relative flex items-center">
                <Building className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                />
              </div>
            </div>

            {/* Lead Source */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Lead Source</label>
              <div className="relative flex items-center">
                <Compass className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all appearance-none"
                >
                  {sources.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Interested In */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Interested Product / Service</label>
              <div className="relative flex items-center">
                <Tag className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  value={interestedIn}
                  onChange={(e) => setInterestedIn(e.target.value)}
                  placeholder="e.g. Enterprise Plan, SaaS Software"
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                />
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as LeadStatus)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
              >
                {statuses.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            {/* Follow-up Date */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Next Follow-up Date</label>
              <div className="relative flex items-center">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                <input
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Notes & Context</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add key notes from past interactions or deal specifics..."
              className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all resize-none"
            />
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-semibold text-xs shadow-lg shadow-brand-600/30 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              <span>{leadToEdit ? 'Save Changes' : 'Create Lead'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
