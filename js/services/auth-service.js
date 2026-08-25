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
    } else {
      // Local demo mode session check
      const localUser = localStorage.getItem('nexuslead_local_user');
      if (localUser) {
        try {
          this.currentUser = JSON.parse(localUser);
        } catch (_) {}
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
    // In local demo environment: return true if demo user is stored
    return Boolean(localStorage.getItem('nexuslead_local_user') || localStorage.getItem('nexuslead_state_v1'));
  }

  async signUp({ email, password, fullName, workspaceName = 'My Workspace' }) {
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

    // Local fallback when Supabase keys not set
    const mockUser = {
      id: 'usr_' + Date.now(),
      email,
      name: fullName || email.split('@')[0],
      role: 'OWNER',
      workspaceName
    };
    this.currentUser = mockUser;
    localStorage.setItem('nexuslead_local_user', JSON.stringify(mockUser));
    return { user: mockUser, session: { access_token: 'mock_token_' + Date.now() } };
  }

  async signIn({ email, password }) {
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

    // Local fallback
    const mockUser = {
      id: 'usr_local_demo',
      email,
      name: email.split('@')[0],
      role: 'OWNER'
    };
    this.currentUser = mockUser;
    localStorage.setItem('nexuslead_local_user', JSON.stringify(mockUser));
    return { user: mockUser, session: { access_token: 'mock_token_' + Date.now() } };
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
