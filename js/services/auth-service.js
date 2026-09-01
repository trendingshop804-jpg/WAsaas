/* ==========================================================================
   NexusLead AI — Supabase Authentication Service
   Handles:
     - User Email/Password Signup & Profile Initialization
     - User Login & Session Persistence
     - Password Reset Flows
     - Route Guarding & Auth State Subscriptions
   ========================================================================== */

class AuthService {
  constructor() {
    this.currentUser = null;
    this.currentSession = null;
    this.supabase = null;
    this.authListeners = new Set();
    this.initSupabaseClient();
  }

  initSupabaseClient() {
    try {
      if (typeof window.supabase !== 'undefined' && window.supabaseConfig && window.supabaseConfig.isSupabaseConfigured()) {
        this.supabase = window.supabase.createClient(
          window.supabaseConfig.projectUrl,
          window.supabaseConfig.anonKey,
          {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true,
              storage: window.localStorage
            }
          }
        );
      }
    } catch (err) {
      console.warn('[AuthService] Supabase client initialization warning:', err.message);
    }
  }

  async init() {
    if (window.supabaseConfig?.ready) {
      await window.supabaseConfig.ready;
    }

    if (!this.supabase && window.supabaseConfig && window.supabaseConfig.isSupabaseConfigured()) {
      this.initSupabaseClient();
    }

    if (this.supabase) {
      try {
        const { data: { session }, error } = await this.supabase.auth.getSession();
        if (session && !error) {
          this.currentSession = session;
          this.currentUser = session.user;
          await this.syncUserProfile();
        }

        // Listen for auth changes (Login, Logout, Token Refresh)
        this.supabase.auth.onAuthStateChange(async (event, session) => {
          this.currentSession = session;
          this.currentUser = session ? session.user : null;
          if (session) {
            await this.syncUserProfile();
          } else {
            this.clearLocalUser();
          }
          this.notifyListeners(event, session);
        });
      } catch (err) {
        console.warn('[AuthService] Session check error:', err);
      }
    }
  }

  async syncUserProfile() {
    if (!this.supabase || !this.currentUser) return;
    try {
      const { data: profile } = await this.supabase
        .from('users')
        .select('id, name, email, role, organization_id, organizations(*)')
        .eq('id', this.currentUser.id)
        .single();

      if (profile) {
        this.currentUser.profile = profile;
        if (profile.organizations) {
          window.appState.set('currentOrgId', profile.organizations.id);
          const orgs = window.appState.get('organizations') || [];
          if (!orgs.some(o => o.id === profile.organizations.id)) {
            orgs.unshift(profile.organizations);
            window.appState.set('organizations', orgs);
          }
        }
      }
    } catch (e) {
      console.warn('[AuthService] Could not sync database profile:', e.message);
    }
  }

  clearLocalUser() {
    this.currentUser = null;
    this.currentSession = null;
    localStorage.removeItem('nexuslead_local_user');
  }

  isAuthenticated() {
    if (this.supabase) {
      return Boolean(this.currentSession || this.currentUser);
    }
    return false;
  }

  getMissingConfigDetails() {
    const missing = [];
    if (!window.supabaseConfig?.projectUrl) missing.push('VITE_SUPABASE_URL (or SUPABASE_URL)');
    if (!window.supabaseConfig?.anonKey) missing.push('VITE_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY)');
    if (typeof window.supabase === 'undefined') missing.push('Supabase JS SDK (@supabase/supabase-js)');
    return missing;
  }

  async signUp({ email, password, fullName, workspaceName = 'My Workspace' }) {
    if (!this.supabase && window.supabaseConfig && window.supabaseConfig.isSupabaseConfigured()) {
      this.initSupabaseClient();
    }

    if (this.supabase) {
      const { data, error } = await this.supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            workspace_name: workspaceName
          }
        }
      });

      if (error) throw new Error(error.message);
      this.currentUser = data.user;
      this.currentSession = data.session;
      await this.syncUserProfile();
      return data;
    }

    const missing = this.getMissingConfigDetails();
    const missingMsg = missing.length > 0 ? ` Missing: ${missing.join(', ')}.` : '';
    console.error(`[AuthService] Supabase authentication is not configured.${missingMsg}`);
    throw new Error(`Authentication is not configured.${missingMsg} Add your Supabase project URL and anon key before creating an account.`);
  }

  async signIn({ email, password }) {
    if (!this.supabase && window.supabaseConfig && window.supabaseConfig.isSupabaseConfigured()) {
      this.initSupabaseClient();
    }

    if (this.supabase) {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw new Error(error.message);
      this.currentUser = data.user;
      this.currentSession = data.session;
      await this.syncUserProfile();
      return data;
    }

    const missing = this.getMissingConfigDetails();
    const missingMsg = missing.length > 0 ? ` Missing: ${missing.join(', ')}.` : '';
    console.error(`[AuthService] Supabase authentication is not configured.${missingMsg}`);
    throw new Error(`Authentication is not configured.${missingMsg} Add your Supabase project URL and anon key before signing in.`);
  }

  async signOut() {
    if (this.supabase) {
      await this.supabase.auth.signOut();
    }
    this.clearLocalUser();
    this.notifyListeners('SIGNED_OUT', null);
  }

  async resetPassword(email) {
    if (this.supabase) {
      const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/#reset-password'
      });
      if (error) throw new Error(error.message);
      return { success: true };
    }
    return { success: true, message: 'Password reset link sent (demo simulation).' };
  }

  getUser() {
    return this.currentUser;
  }

  onAuthStateChange(callback) {
    this.authListeners.add(callback);
    return () => this.authListeners.delete(callback);
  }

  notifyListeners(event, session) {
    this.authListeners.forEach(cb => {
      try { cb(event, session); } catch (e) { console.error('Auth listener error:', e); }
    });
  }
}

window.authService = new AuthService();
