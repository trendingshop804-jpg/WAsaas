import React from 'react';
import { Lead } from '../../types';
import {
  CalendarCheck,
  Phone,
  Mail,
  MessageSquare,
  CheckCircle,
  Eye,
  Edit2,
  Trash2,
  Tag,
  Clock,
  Send,
  AlertTriangle,
} from 'lucide-react';
import { buildWhatsAppUrl, buildMailtoUrl } from '../../lib/messages';

interface TodaysFollowUpsProps {
  todayLeads: Lead[];
  overdueLeads: Lead[];
  onViewLead: (lead: Lead) => void;
  onEditLead: (lead: Lead) => void;
  onDeleteLead: (lead: Lead) => void;
  onMarkContacted: (lead: Lead) => void;
  onGenerateMessage: (lead: Lead) => void;
}

export const TodaysFollowUps: React.FC<TodaysFollowUpsProps> = ({
  todayLeads,
  overdueLeads,
  onViewLead,
  onEditLead,
  onDeleteLead,
  onMarkContacted,
  onGenerateMessage,
}) => {
  return (
    <div className="space-y-6">
      {/* Overdue Section Alert Banner if overdue leads exist */}
      {overdueLeads.length > 0 && (
        <div className="p-5 rounded-2xl bg-rose-950/40 border border-rose-800/60 backdrop-blur-md shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                <AlertTriangle className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  Overdue Follow-ups
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-xs font-semibold border border-rose-500/30">
                    {overdueLeads.length} Action Needed
                  </span>
                </h3>
                <p className="text-xs text-rose-300/80">
                  These leads were scheduled for follow-up prior to today. Contact them as soon as possible!
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {overdueLeads.map((lead) => (
              <LeadActionCard
                key={lead.id}
                lead={lead}
                isOverdue={true}
                onViewLead={onViewLead}
                onEditLead={onEditLead}
                onDeleteLead={onDeleteLead}
                onMarkContacted={onMarkContacted}
                onGenerateMessage={onGenerateMessage}
              />
            ))}
          </div>
        </div>
      )}

      {/* Today's Follow-ups Section */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800/90 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-brand-500/15 text-brand-400 border border-brand-500/30">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Today's Follow-ups</h3>
              <p className="text-xs text-slate-400">Scheduled for follow-up today</p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-700">
            {todayLeads.length} {todayLeads.length === 1 ? 'Lead' : 'Leads'}
          </span>
        </div>

        {todayLeads.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
            <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-2 opacity-80" />
            <h4 className="text-sm font-semibold text-slate-200">All caught up for today!</h4>
            <p className="text-xs text-slate-400 mt-1">No pending follow-ups scheduled for today.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {todayLeads.map((lead) => (
              <LeadActionCard
                key={lead.id}
                lead={lead}
                isOverdue={false}
                onViewLead={onViewLead}
                onEditLead={onEditLead}
                onDeleteLead={onDeleteLead}
                onMarkContacted={onMarkContacted}
                onGenerateMessage={onGenerateMessage}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface LeadActionCardProps {
  lead: Lead;
  isOverdue: boolean;
  onViewLead: (lead: Lead) => void;
  onEditLead: (lead: Lead) => void;
  onDeleteLead: (lead: Lead) => void;
  onMarkContacted: (lead: Lead) => void;
  onGenerateMessage: (lead: Lead) => void;
}

const LeadActionCard: React.FC<LeadActionCardProps> = ({
  lead,
  isOverdue,
  onViewLead,
  onEditLead,
  onDeleteLead,
  onMarkContacted,
  onGenerateMessage,
}) => {
  const getStatusBadge = (status: string) => {
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

  return (
    <div
      className={`p-4 rounded-xl bg-slate-950/80 border transition-all duration-200 hover:border-slate-700 flex flex-col justify-between ${
        isOverdue ? 'border-rose-900/60 bg-rose-950/20' : 'border-slate-800'
      }`}
    >
      <div>
        {/* Header: Name & Status */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <h4
              onClick={() => onViewLead(lead)}
              className="text-sm font-bold text-white hover:text-brand-400 cursor-pointer transition-colors truncate"
            >
              {lead.name}
            </h4>
            {lead.company && (
              <p className="text-xs text-slate-400 truncate">{lead.company}</p>
            )}
          </div>
          <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${getStatusBadge(lead.status)}`}>
            {lead.status}
          </span>
        </div>

        {/* Interested Product/Service */}
        {lead.interested_in && (
          <div className="flex items-center gap-1.5 text-xs text-slate-300 my-2 bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800">
            <Tag className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
            <span className="truncate">{lead.interested_in}</span>
          </div>
        )}

        {/* Dates Info */}
        <div className="space-y-1 my-2 text-[11px] text-slate-400">
          {lead.next_follow_up_date && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <span>
                Follow-up Due: <strong className={isOverdue ? 'text-rose-400' : 'text-slate-200'}>{lead.next_follow_up_date}</strong>
              </span>
            </div>
          )}
          {lead.last_contacted_at && (
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <span>Last Contacted: {new Date(lead.last_contacted_at).toLocaleDateString()}</span>
            </div>
          )}
        </div>

        {/* Notes preview */}
        {lead.notes && (
          <p className="text-xs text-slate-400 italic line-clamp-2 bg-slate-900/40 p-2 rounded-lg border border-slate-800/50 mb-3">
            "{lead.notes}"
          </p>
        )}
      </div>

      {/* Action Toolbar */}
      <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onMarkContacted(lead)}
            className="px-2.5 py-1.5 rounded-lg bg-brand-600/20 hover:bg-brand-600 text-brand-300 hover:text-white text-xs font-semibold border border-brand-500/30 transition-all flex items-center gap-1"
            title="Mark as Contacted / Schedule Follow-up"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Contacted</span>
          </button>

          <button
            onClick={() => onGenerateMessage(lead)}
            className="p-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 transition-all"
            title="Generate Follow-up Message"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          {lead.phone && (
            <a
              href={buildWhatsAppUrl(lead.phone, `Hi ${lead.name}, following up regarding our conversation.`)}
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
      </div>
    </div>
  );
};
