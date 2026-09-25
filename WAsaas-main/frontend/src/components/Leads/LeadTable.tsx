import React from 'react';
import { Lead, LeadStatus } from '../../types';
import {
  Phone,
  Mail,
  Building,
  Tag,
  Clock,
  CheckCircle,
  Eye,
  Edit2,
  Trash2,
  MessageSquare,
  Send,
  MoreVertical,
  Calendar,
} from 'lucide-react';
import { buildWhatsAppUrl, buildMailtoUrl } from '../../lib/messages';

interface LeadTableProps {
  leads: Lead[];
  loading: boolean;
  onViewLead: (lead: Lead) => void;
  onEditLead: (lead: Lead) => void;
  onDeleteLead: (lead: Lead) => void;
  onMarkContacted: (lead: Lead) => void;
  onGenerateMessage: (lead: Lead) => void;
  onAddLeadClick: () => void;
}

export const LeadTable: React.FC<LeadTableProps> = ({
  leads,
  loading,
  onViewLead,
  onEditLead,
  onDeleteLead,
  onMarkContacted,
  onGenerateMessage,
  onAddLeadClick,
}) => {
  const getStatusBadge = (status: LeadStatus) => {
    switch (status) {
      case 'New':
        return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
      case 'Contacted':
        return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
      case 'Interested':
        return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
      case 'Follow-up':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      case 'Won':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'Lost':
        return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-slate-800/60 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center shadow-xl">
        <div className="w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center mx-auto mb-4">
          <Calendar className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-white">No leads found</h3>
        <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
          Get started by adding your first lead or clearing your search filters.
        </p>
        <button
          onClick={onAddLeadClick}
          className="mt-5 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs shadow-lg shadow-brand-600/30 transition-all"
        >
          + Add New Lead
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
      {/* Desktop Table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <th className="py-4 px-5">Lead Name</th>
              <th className="py-4 px-5">Contact Details</th>
              <th className="py-4 px-5">Company & Source</th>
              <th className="py-4 px-5">Interested In</th>
              <th className="py-4 px-5">Status</th>
              <th className="py-4 px-5">Follow-up Schedule</th>
              <th className="py-4 px-5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 text-xs">
            {leads.map((lead) => (
              <tr
                key={lead.id}
                className="hover:bg-slate-800/40 transition-colors group"
              >
                {/* Lead Name */}
                <td className="py-4 px-5">
                  <div
                    onClick={() => onViewLead(lead)}
                    className="font-bold text-white hover:text-brand-400 cursor-pointer transition-colors"
                  >
                    {lead.name}
                  </div>
                  {lead.notes && (
                    <p className="text-[11px] text-slate-400 truncate max-w-xs mt-0.5 font-normal">
                      {lead.notes}
                    </p>
                  )}
                </td>

                {/* Contact Details */}
                <td className="py-4 px-5">
                  <div className="space-y-1">
                    {lead.phone ? (
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Phone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span className="font-mono">{lead.phone}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">No phone</span>
                    )}

                    {lead.email && (
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Mail className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span className="truncate max-w-[150px]">{lead.email}</span>
                      </div>
                    )}
                  </div>
                </td>

                {/* Company & Source */}
                <td className="py-4 px-5">
                  <div>
                    {lead.company ? (
                      <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                        <Building className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span>{lead.company}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">N/A</span>
                    )}
                    {lead.source && (
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        Source: {lead.source}
                      </span>
                    )}
                  </div>
                </td>

                {/* Interested In */}
                <td className="py-4 px-5">
                  {lead.interested_in ? (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 text-slate-300 border border-slate-800">
                      <Tag className="w-3 h-3 text-brand-400 flex-shrink-0" />
                      <span className="truncate max-w-[130px] font-medium">{lead.interested_in}</span>
                    </div>
                  ) : (
                    <span className="text-slate-400 italic">—</span>
                  )}
                </td>

                {/* Status */}
                <td className="py-4 px-5">
                  <span
                    className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-semibold border ${getStatusBadge(
                      lead.status
                    )}`}
                  >
                    {lead.status}
                  </span>
                </td>

                {/* Follow-up Schedule */}
                <td className="py-4 px-5">
                  <div className="space-y-1">
                    {lead.next_follow_up_date ? (
                      <div className="flex items-center gap-1.5 text-slate-200">
                        <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        <span className="font-semibold">{lead.next_follow_up_date}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">Not set</span>
                    )}

                    {lead.last_contacted_at && (
                      <div className="text-[11px] text-slate-400">
                        Last: {new Date(lead.last_contacted_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </td>

                {/* Action Buttons */}
                <td className="py-4 px-5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onMarkContacted(lead)}
                      className="px-2.5 py-1.5 rounded-lg bg-brand-600/20 hover:bg-brand-600 text-brand-300 hover:text-white text-[11px] font-semibold border border-brand-500/30 transition-all"
                      title="Mark as Contacted"
                    >
                      Contacted
                    </button>

                    <button
                      onClick={() => onGenerateMessage(lead)}
                      className="p-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 transition-all"
                      title="Generate Message"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>

                    {lead.phone && (
                      <a
                        href={buildWhatsAppUrl(lead.phone, `Hi ${lead.name}, following up regarding our discussion.`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 transition-all"
                        title="Open WhatsApp"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </a>
                    )}

                    {lead.email && (
                      <a
                        href={buildMailtoUrl(lead.email, `Follow-up for ${lead.name}`, `Hi ${lead.name},`)}
                        className="p-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 transition-all"
                        title="Send Email"
                      >
                        <Mail className="w-3.5 h-3.5" />
                      </a>
                    )}

                    <button
                      onClick={() => onViewLead(lead)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                      title="View Details"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => onEditLead(lead)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                      title="Edit Lead"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => onDeleteLead(lead)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Delete Lead"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List View */}
      <div className="lg:hidden divide-y divide-slate-800">
        {leads.map((lead) => (
          <div key={lead.id} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4
                  onClick={() => onViewLead(lead)}
                  className="font-bold text-white text-base hover:text-brand-400 cursor-pointer"
                >
                  {lead.name}
                </h4>
                {lead.company && <p className="text-xs text-slate-400">{lead.company}</p>}
              </div>

              <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold border ${getStatusBadge(lead.status)}`}>
                {lead.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
              <div>
                <span className="text-slate-400 block text-[10px]">Phone</span>
                <span className="font-mono">{lead.phone || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Next Follow-up</span>
                <span className="font-semibold text-amber-400">{lead.next_follow_up_date || 'None'}</span>
              </div>
              {lead.interested_in && (
                <div className="col-span-2">
                  <span className="text-slate-400 block text-[10px]">Interested In</span>
                  <span>{lead.interested_in}</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/60">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onMarkContacted(lead)}
                  className="px-2.5 py-1.5 rounded-lg bg-brand-600/20 text-brand-300 text-xs font-semibold border border-brand-500/30"
                >
                  Contacted
                </button>
                <button
                  onClick={() => onGenerateMessage(lead)}
                  className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-1">
                {lead.phone && (
                  <a
                    href={buildWhatsAppUrl(lead.phone, `Hi ${lead.name}, following up.`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </a>
                )}
                {lead.email && (
                  <a
                    href={buildMailtoUrl(lead.email, `Follow-up for ${lead.name}`, `Hi ${lead.name},`)}
                    className="p-2 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30"
                  >
                    <Mail className="w-4 h-4" />
                  </a>
                )}
                <button
                  onClick={() => onViewLead(lead)}
                  className="p-2 rounded-lg text-slate-400 hover:text-white"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onEditLead(lead)}
                  className="p-2 rounded-lg text-slate-400 hover:text-white"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDeleteLead(lead)}
                  className="p-2 rounded-lg text-slate-400 hover:text-rose-400"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
