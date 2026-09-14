import React, { useState, useEffect } from 'react';
import { UserSettings, MessageTone } from '../../types';
import { fetchUserSettings, saveUserSettings } from '../../lib/settings';
import { Settings as SettingsIcon, Save, User, Clock, MessageSquare } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface SettingsViewProps {
  onShowToast: (title: string, description?: string, type?: 'success' | 'error' | 'info') => void;
  onSettingsSaved: (settings: UserSettings) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onShowToast, onSettingsSaved }) => {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [defaultInterval, setDefaultInterval] = useState(3);
  const [defaultTone, setDefaultTone] = useState<MessageTone>('Professional');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    const settings = await fetchUserSettings();
    setDisplayName(settings.display_name);
    setDefaultInterval(settings.default_interval);
    setDefaultTone(settings.default_tone);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const updated = await saveUserSettings({
        display_name: displayName,
        default_interval: Number(defaultInterval),
        default_tone: defaultTone,
      });

      onSettingsSaved(updated);
      onShowToast('Settings Saved', 'Your application preferences have been updated.', 'success');
    } catch (err: any) {
      onShowToast('Save Failed', err.message || 'Could not update settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl text-center text-slate-400">
        Loading preferences...
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
          <div className="p-2.5 rounded-xl bg-brand-500/15 text-brand-400 border border-brand-500/30">
            <SettingsIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Application Settings</h2>
            <p className="text-xs text-slate-400">Customize your account and follow-up preferences</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          {/* User Display Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              User Display Name
            </label>
            <div className="relative flex items-center">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Sarah Jenkins"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-brand-500 transition-all"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Account Email: <strong className="text-slate-300">{user?.email}</strong>
            </p>
          </div>

          {/* Default Follow-up Interval */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Default Follow-up Interval (Days)
            </label>
            <div className="relative flex items-center">
              <Clock className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
              <input
                type="number"
                min={1}
                max={90}
                required
                value={defaultInterval}
                onChange={(e) => setDefaultInterval(Number(e.target.value))}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-brand-500 transition-all"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Default number of days when marking a lead as contacted or creating new leads.
            </p>
          </div>

          {/* Default Message Tone */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Default Message Generator Tone
            </label>
            <div className="relative flex items-center">
              <MessageSquare className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
              <select
                value={defaultTone}
                onChange={(e) => setDefaultTone(e.target.value as MessageTone)}
                className="w-full pl-10 pr-8 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-brand-500 transition-all"
              >
                <option value="Professional">Professional</option>
                <option value="Friendly">Friendly</option>
                <option value="Short Sales">Short Sales</option>
                <option value="Polite">Polite</option>
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex items-center justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-semibold text-xs shadow-lg shadow-brand-600/30 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>Save Preferences</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
