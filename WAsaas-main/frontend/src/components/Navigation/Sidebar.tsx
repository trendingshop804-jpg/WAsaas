import React from 'react';
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  AlertCircle,
  FileText,
  Settings,
  LogOut,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export type NavTab = 'dashboard' | 'leads' | 'today' | 'overdue' | 'templates' | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  counts: {
    total: number;
    today: number;
    overdue: number;
  };
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  counts,
  isMobileOpen,
  setIsMobileOpen,
}) => {
  const { user, signOut } = useAuth();

  const navItems = [
    {
      id: 'dashboard' as NavTab,
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'leads' as NavTab,
      label: 'Leads',
      icon: Users,
      badge: counts.total > 0 ? counts.total : null,
      badgeColor: 'bg-slate-800 text-slate-300',
    },
    {
      id: 'today' as NavTab,
      label: "Today's Follow-ups",
      icon: CalendarCheck,
      badge: counts.today > 0 ? counts.today : null,
      badgeColor: 'bg-brand-500/20 text-brand-400 border border-brand-500/30',
    },
    {
      id: 'overdue' as NavTab,
      label: 'Overdue Follow-ups',
      icon: AlertCircle,
      badge: counts.overdue > 0 ? counts.overdue : null,
      badgeColor: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
    },
    {
      id: 'templates' as NavTab,
      label: 'Message Templates',
      icon: FileText,
      badge: null,
    },
    {
      id: 'settings' as NavTab,
      label: 'Settings',
      icon: Settings,
      badge: null,
    },
  ];

  const handleSelectTab = (tab: NavTab) => {
    setActiveTab(tab);
    setIsMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm lg:hidden animate-fadeIn"
        />
      )}

      {/* Sidebar Drawer */}
      <aside
        className={`fixed lg:static top-0 left-0 z-40 h-full w-72 bg-slate-900 border-r border-slate-800/80 flex flex-col justify-between transition-transform duration-300 ease-in-out ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-6">
          {/* Logo & Brand Header */}
          <div className="flex items-center gap-3 pb-6 border-b border-slate-800">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-brand-500/25">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-white tracking-tight leading-none">
                LeadFlow <span className="text-xs px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-400 font-semibold border border-brand-500/30">PRO</span>
              </h1>
              <p className="text-xs text-slate-400 mt-1 font-medium">Follow-up Management OS</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="mt-6 space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectTab(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl font-medium text-sm transition-all duration-200 ${
                    isActive
                      ? 'bg-brand-600/15 text-brand-400 border border-brand-500/30 shadow-md shadow-brand-500/5'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-5 h-5 transition-colors ${isActive ? 'text-brand-400' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {item.badge !== null && (
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${item.badgeColor}`}>
                        {item.badge}
                      </span>
                    )}
                    {isActive && <ChevronRight className="w-4 h-4 text-brand-400" />}
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Info & Sign Out Footer */}
        <div className="p-4 m-4 bg-slate-950/60 border border-slate-800/80 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-brand-600/20 border border-brand-500/30 text-brand-400 font-bold flex items-center justify-center text-sm uppercase">
              {user?.email?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">
                {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Authenticated User'}
              </p>
              <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
            </div>
          </div>

          <button
            onClick={() => signOut()}
            className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 border border-rose-500/20 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
};
