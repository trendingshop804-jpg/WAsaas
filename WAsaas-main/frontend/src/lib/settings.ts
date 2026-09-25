import { supabase } from './supabase';
import { UserSettings, MessageTone } from '../types';

const LOCAL_STORAGE_SETTINGS_KEY = 'leadflow_user_settings';

export const DEFAULT_SETTINGS: UserSettings = {
  user_id: '',
  display_name: 'Lead Manager',
  default_interval: 3,
  default_tone: 'Professional',
};

export const fetchUserSettings = async (): Promise<UserSettings> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return DEFAULT_SETTINGS;

    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.warn('[Settings] Failed to fetch settings from Supabase, falling back to local:', error.message);
    }

    if (data) {
      return {
        id: data.id,
        user_id: data.user_id,
        display_name: data.display_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
        default_interval: Number(data.default_interval) || 3,
        default_tone: (data.default_tone as MessageTone) || 'Professional',
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
    }

    // Try local storage if not found in database
    const local = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
    if (local) {
      try {
        const parsed = JSON.parse(local);
        return { ...DEFAULT_SETTINGS, ...parsed, user_id: user.id };
      } catch (e) {
        // ignore
      }
    }

    return {
      ...DEFAULT_SETTINGS,
      user_id: user.id,
      display_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Lead Manager',
    };
  } catch (err) {
    console.error('Error fetching settings:', err);
    return DEFAULT_SETTINGS;
  }
};

export const saveUserSettings = async (
  settings: Partial<UserSettings>
): Promise<UserSettings> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authentication required to save settings.');

  const payload = {
    user_id: user.id,
    display_name: settings.display_name?.trim() || 'User',
    default_interval: Number(settings.default_interval) || 3,
    default_tone: settings.default_tone || 'Professional',
    updated_at: new Date().toISOString(),
  };

  // Always sync to local storage as fallback
  localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(payload));

  const { data, error } = await supabase
    .from('user_settings')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    console.warn('[Settings] Could not update Supabase database, saved locally:', error.message);
    return { ...DEFAULT_SETTINGS, ...payload };
  }

  return {
    id: data.id,
    user_id: data.user_id,
    display_name: data.display_name,
    default_interval: Number(data.default_interval),
    default_tone: data.default_tone as MessageTone,
  };
};
