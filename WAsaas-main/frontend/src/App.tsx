import React, { useState, useEffect, useMemo } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthModal } from './components/Auth/AuthModal';
import { Sidebar, NavTab } from './components/Navigation/Sidebar';
import { Header } from './components/Navigation/Header';
import { SummaryCards } from './components/Dashboard/SummaryCards';
import { TodaysFollowUps } from './components/Dashboard/TodaysFollowUps';
import { LeadFilterBar } from './components/Leads/LeadFilterBar';
import { LeadTable } from './components/Leads/LeadTable';
import { LeadFormModal } from './components/Leads/LeadFormModal';
import { LeadDetailsModal } from './components/Leads/LeadDetailsModal';
import { ContactedModal } from './components/Leads/ContactedModal';
import { ConfirmModal } from './components/UI/ConfirmModal';
import { MessageGeneratorModal } from './components/Messages/MessageGeneratorModal';
import { MessageTemplatesView } from './components/Templates/MessageTemplatesView';
import { SettingsView } from './components/Settings/SettingsView';
import { ToastContainer } from './components/UI/Toast';
import { Lead, LeadFilterOptions, ToastMessage, UserSettings } from './types';
import { fetchLeads, createLead, updateLead, deleteLead, markLeadAsContacted } from './lib/leads';
import { fetchUserSettings, DEFAULT_SETTINGS } from './lib/settings';

const AppContent: React.FC = () => {
  const { user, loading: authLoading } = useAuth();

  // Primary Data State
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [userSettings, setUserSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

  // Navigation State
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false);

  // Filter & Search State
  const [filters, setFilters] = useState<LeadFilterOptions>({
    search: '',
    status: 'all',
    category: 'all',
    sortBy: 'newest',
  });

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [leadToEdit, setLeadToEdit] = useState<Lead | null>(null);

  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  const [leadToContact, setLeadToContact] = useState<Lead | null>(null);
  const [leadToView, setLeadToView] = useState<Lead | null>(null);

  const [isMessageGenOpen, setIsMessageGenOpen] = useState<boolean>(false);
  const [leadForMessageGen, setLeadForMessageGen] = useState<Lead | null>(null);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (
    title: string,
    description?: string,
    type: 'success' | 'error' | 'info' | 'warning' = 'info'
  ) => {
    const id = Date.now().toString() + Math.random().toString().substring(2, 5);
    setToasts((prev) => [...prev, { id, title, description, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Load Leads & Settings on Auth Login
  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    setLoadingLeads(true);
    try {
      const [fetchedLeads, settings] = await Promise.all([
        fetchLeads(),
        fetchUserSettings(),
      ]);
      setLeads(fetchedLeads);
      setUserSettings(settings);
    } catch (err: any) {
      addToast('Data Error', err.message || 'Could not load leads.', 'error');
    } finally {
      setLoadingLeads(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    addToast('Data Refreshed', 'Lead list updated from database.', 'success');
  };

  // Dates & Category Math using local date YYYY-MM-DD
  const todayStr = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const stats = useMemo(() => {
    let today = 0;
    let overdue = 0;
    let newLeads = 0;
    let interested = 0;
    let won = 0;

    leads.forEach((l) => {
      if (l.status === 'New') newLeads++;
      if (l.status === 'Interested') interested++;
      if (l.status === 'Won') won++;

      if (l.next_follow_up_date) {
        if (l.next_follow_up_date === todayStr) {
          today++;
        } else if (l.next_follow_up_date < todayStr && l.status !== 'Won' && l.status !== 'Lost') {
          overdue++;
        }
      }
    });

    return {
      total: leads.length,
      newLeads,
      today,
      overdue,
      interested,
      won,
    };
  }, [leads, todayStr]);

  const todayLeadsList = useMemo(() => {
    return leads.filter((l) => l.next_follow_up_date === todayStr);
  }, [leads, todayStr]);

  const overdueLeadsList = useMemo(() => {
    return leads.filter(
      (l) => l.next_follow_up_date && l.next_follow_up_date < todayStr && l.status !== 'Won' && l.status !== 'Lost'
    );
  }, [leads, todayStr]);

  // Filtered Leads Computation for Leads View
  const filteredLeads = useMemo(() => {
    return leads
      .filter((lead) => {
        // Tab Specific Override Filter
        if (activeTab === 'today' && lead.next_follow_up_date !== todayStr) return false;
        if (activeTab === 'overdue') {
          if (!lead.next_follow_up_date || lead.next_follow_up_date >= todayStr || lead.status === 'Won' || lead.status === 'Lost') {
            return false;
          }
        }

        // Search Filter (name, phone, email)
        if (filters.search.trim()) {
          const q = filters.search.toLowerCase();
          const nameMatch = lead.name.toLowerCase().includes(q);
          const phoneMatch = lead.phone?.toLowerCase().includes(q);
          const emailMatch = lead.email?.toLowerCase().includes(q);
          const companyMatch = lead.company?.toLowerCase().includes(q);
          if (!nameMatch && !phoneMatch && !emailMatch && !companyMatch) return false;
        }

        // Status Filter
        if (filters.status !== 'all' && lead.status !== filters.status) return false;

        // Date Category Filter
        if (filters.category === 'today' && lead.next_follow_up_date !== todayStr) return false;
        if (filters.category === 'overdue') {
          if (!lead.next_follow_up_date || lead.next_follow_up_date >= todayStr || lead.status === 'Won' || lead.status === 'Lost') {
            return false;
          }
        }
        if (filters.category === 'upcoming') {
          if (!lead.next_follow_up_date || lead.next_follow_up_date <= todayStr) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (filters.sortBy === 'newest') {
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        }
        if (filters.sortBy === 'oldest') {
          return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
        }
        if (filters.sortBy === 'next_follow_up') {
          if (!a.next_follow_up_date) return 1;
          if (!b.next_follow_up_date) return -1;
          return a.next_follow_up_date.localeCompare(b.next_follow_up_date);
        }
        return 0;
      });
  }, [leads, activeTab, filters, todayStr]);

  // Lead CRUD Operations
  const handleSaveLead = async (
    leadData: Omit<Lead, 'id' | 'created_at' | 'updated_at'>,
    isEdit: boolean,
    leadId?: string
  ) => {
    if (isEdit && leadId) {
      const updated = await updateLead(leadId, leadData);
      setLeads((prev) => prev.map((l) => (l.id === leadId ? updated : l)));
      addToast('Lead Updated', `Changes for ${updated.name} persisted successfully.`, 'success');
    } else {
      const created = await createLead(leadData);
      setLeads((prev) => [created, ...prev]);
      addToast('Lead Added', `${created.name} was added to your pipeline.`, 'success');
    }
  };

  const handleConfirmDelete = async () => {
    if (!leadToDelete) return;
    try {
      setDeleting(true);
      await deleteLead(leadToDelete.id);
      setLeads((prev) => prev.filter((l) => l.id !== leadToDelete.id));
      addToast('Lead Deleted', `${leadToDelete.name} was removed from database.`, 'success');
      setLeadToDelete(null);
    } catch (err: any) {
      addToast('Delete Failed', err.message || 'Could not delete lead.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleConfirmMarkContacted = async (
    leadId: string,
    nextFollowUpDate?: string,
    newStatus?: any
  ) => {
    try {
      const updated = await markLeadAsContacted(leadId, nextFollowUpDate, newStatus);
      setLeads((prev) => prev.map((l) => (l.id === leadId ? updated : l)));
      addToast('Status Updated', `Contact logged for ${updated.name}.`, 'success');
    } catch (err: any) {
      addToast('Update Failed', err.message || 'Could not record contact.', 'error');
    }
  };

  const handleOpenGeneratorForLead = (lead: Lead) => {
    setLeadForMessageGen(lead);
    setIsMessageGenOpen(true);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
          <span className="text-sm font-semibold text-slate-300">Loading LeadFlow OS...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthModal onShowToast={addToast} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col lg:flex-row">
      {/* Toast Notification Container */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        counts={{
          total: stats.total,
          today: stats.today,
          overdue: stats.overdue,
        }}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
      />

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <Header
          activeTab={activeTab}
          onOpenAddLead={() => {
            setLeadToEdit(null);
            setIsFormOpen(true);
          }}
          onToggleMobileMenu={() => setIsMobileOpen(!isMobileOpen)}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          searchQuery={filters.search}
          setSearchQuery={(q) => setFilters((prev) => ({ ...prev, search: q }))}
        />

        <main className="p-4 sm:p-6 space-y-6 flex-1 max-w-7xl w-full mx-auto">
          {/* Summary Metric Cards (Visible on Dashboard, Leads, Today, Overdue) */}
          {activeTab !== 'settings' && activeTab !== 'templates' && (
            <SummaryCards
              stats={stats}
              onSelectCategory={(tab) => setActiveTab(tab)}
            />
          )}

          {/* TAB 1: DASHBOARD VIEW */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Today's & Overdue Follow-ups Block */}
              <TodaysFollowUps
                todayLeads={todayLeadsList}
                overdueLeads={overdueLeadsList}
                onViewLead={(lead) => setLeadToView(lead)}
                onEditLead={(lead) => {
                  setLeadToEdit(lead);
                  setIsFormOpen(true);
                }}
                onDeleteLead={(lead) => setLeadToDelete(lead)}
                onMarkContacted={(lead) => setLeadToContact(lead)}
                onGenerateMessage={handleOpenGeneratorForLead}
              />

              {/* Quick Leads Table Preview */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white">Recent Leads Overview</h3>
                  <button
                    onClick={() => setActiveTab('leads')}
                    className="text-xs font-semibold text-brand-400 hover:text-brand-300"
                  >
                    View All Leads ({stats.total}) →
                  </button>
                </div>

                <LeadTable
                  leads={leads.slice(0, 10)}
                  loading={loadingLeads}
                  onViewLead={(lead) => setLeadToView(lead)}
                  onEditLead={(lead) => {
                    setLeadToEdit(lead);
                    setIsFormOpen(true);
                  }}
                  onDeleteLead={(lead) => setLeadToDelete(lead)}
                  onMarkContacted={(lead) => setLeadToContact(lead)}
                  onGenerateMessage={handleOpenGeneratorForLead}
                  onAddLeadClick={() => {
                    setLeadToEdit(null);
                    setIsFormOpen(true);
                  }}
                />
              </div>
            </div>
          )}

          {/* TAB 2, 3, 4: LEADS / TODAY / OVERDUE LIST VIEW */}
          {(activeTab === 'leads' || activeTab === 'today' || activeTab === 'overdue') && (
            <div className="space-y-4">
              <LeadFilterBar
                filters={filters}
                setFilters={setFilters}
                totalResults={filteredLeads.length}
              />

              <LeadTable
                leads={filteredLeads}
                loading={loadingLeads}
                onViewLead={(lead) => setLeadToView(lead)}
                onEditLead={(lead) => {
                  setLeadToEdit(lead);
                  setIsFormOpen(true);
                }}
                onDeleteLead={(lead) => setLeadToDelete(lead)}
                onMarkContacted={(lead) => setLeadToContact(lead)}
                onGenerateMessage={handleOpenGeneratorForLead}
                onAddLeadClick={() => {
                  setLeadToEdit(null);
                  setIsFormOpen(true);
                }}
              />
            </div>
          )}

          {/* TAB 5: MESSAGE TEMPLATES */}
          {activeTab === 'templates' && (
            <MessageTemplatesView
              onOpenGenerator={() => {
                setLeadForMessageGen(leads[0] || null);
                setIsMessageGenOpen(true);
              }}
              onShowToast={addToast}
            />
          )}

          {/* TAB 6: SETTINGS */}
          {activeTab === 'settings' && (
            <SettingsView
              onShowToast={addToast}
              onSettingsSaved={(newSettings) => setUserSettings(newSettings)}
            />
          )}
        </main>
      </div>

      {/* Add / Edit Lead Modal */}
      <LeadFormModal
        isOpen={isFormOpen}
        leadToEdit={leadToEdit}
        onClose={() => {
          setIsFormOpen(false);
          setLeadToEdit(null);
        }}
        onSubmit={handleSaveLead}
        defaultIntervalDays={userSettings.default_interval}
      />

      {/* Mark as Contacted / Schedule Follow-up Modal */}
      <ContactedModal
        isOpen={!!leadToContact}
        lead={leadToContact}
        onClose={() => setLeadToContact(null)}
        onConfirm={handleConfirmMarkContacted}
        defaultIntervalDays={userSettings.default_interval}
      />

      {/* Delete Lead Confirmation Modal */}
      <ConfirmModal
        isOpen={!!leadToDelete}
        title="Delete Lead Confirmation"
        message={`Are you sure you want to delete "${leadToDelete?.name}"? This will permanently remove the lead and all associated follow-up history from Supabase.`}
        confirmLabel="Delete Lead"
        isDanger={true}
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onClose={() => setLeadToDelete(null)}
      />

      {/* Lead Details Modal */}
      <LeadDetailsModal
        isOpen={!!leadToView}
        lead={leadToView}
        onClose={() => setLeadToView(null)}
        onEditLead={(lead) => {
          setLeadToView(null);
          setLeadToEdit(lead);
          setIsFormOpen(true);
        }}
        onMarkContacted={(lead) => {
          setLeadToView(null);
          setLeadToContact(lead);
        }}
        onShowToast={addToast}
      />

      {/* Message Generator Modal */}
      <MessageGeneratorModal
        isOpen={isMessageGenOpen}
        leads={leads}
        selectedLead={leadForMessageGen}
        defaultTone={userSettings.default_tone}
        onClose={() => {
          setIsMessageGenOpen(false);
          setLeadForMessageGen(null);
        }}
        onShowToast={addToast}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
