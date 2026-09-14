import React from 'react';
import { Users, UserPlus, Calendar, AlertTriangle, Heart, CheckCircle2 } from 'lucide-react';
import { NavTab } from '../Navigation/Sidebar';

interface SummaryCardsProps {
  stats: {
    total: number;
    newLeads: number;
    today: number;
    overdue: number;
    interested: number;
    won: number;
  };
  onSelectCategory: (tab: NavTab) => void;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ stats, onSelectCategory }) => {
  const cards = [
    {
      id: 'total',
      title: 'Total Leads',
      value: stats.total,
      icon: Users,
      color: 'from-blue-600/20 to-indigo-600/20 text-blue-400 border-blue-500/30',
      actionTab: 'leads' as NavTab,
    },
    {
      id: 'new',
      title: 'New Leads',
      value: stats.newLeads,
      icon: UserPlus,
      color: 'from-cyan-600/20 to-teal-600/20 text-cyan-400 border-cyan-500/30',
      actionTab: 'leads' as NavTab,
    },
    {
      id: 'today',
      title: 'Follow-ups Today',
      value: stats.today,
      icon: Calendar,
      color: 'from-amber-600/20 to-orange-600/20 text-amber-400 border-amber-500/30',
      actionTab: 'today' as NavTab,
    },
    {
      id: 'overdue',
      title: 'Overdue Follow-ups',
      value: stats.overdue,
      icon: AlertTriangle,
      color: stats.overdue > 0 ? 'from-rose-600/30 to-red-600/30 text-rose-400 border-rose-500/40 animate-pulse' : 'from-rose-600/20 to-red-600/20 text-rose-400 border-rose-500/30',
      actionTab: 'overdue' as NavTab,
    },
    {
      id: 'interested',
      title: 'Interested Leads',
      value: stats.interested,
      icon: Heart,
      color: 'from-purple-600/20 to-pink-600/20 text-purple-400 border-purple-500/30',
      actionTab: 'leads' as NavTab,
    },
    {
      id: 'won',
      title: 'Won Leads',
      value: stats.won,
      icon: CheckCircle2,
      color: 'from-emerald-600/20 to-green-600/20 text-emerald-400 border-emerald-500/30',
      actionTab: 'leads' as NavTab,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <button
            key={card.id}
            onClick={() => onSelectCategory(card.actionTab)}
            className="group relative p-4 rounded-2xl bg-slate-900 border border-slate-800/90 hover:border-slate-700/80 transition-all duration-300 hover:-translate-y-1 text-left flex flex-col justify-between shadow-lg"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 group-hover:text-slate-200 transition-colors">
                {card.title}
              </span>
              <div className={`p-2 rounded-xl bg-gradient-to-br border ${card.color}`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-4">
              <span className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                {card.value}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
};
