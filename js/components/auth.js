/* ==========================================================================
   NexusLead AI — Auth UI Component (Login, Signup, Forgot Password)
   ========================================================================== */

class AuthComponent {
  constructor() {
    this.activeMode = 'login'; // 'login' | 'signup'
  }

  init() {
    this.bindEvents();
    this.checkInitialSession();

    window.authService.onAuthStateChange((event, session) => {
      this.handleAuthStateChange(event, session);
    });
  }

  bindEvents() {
    // Login Form Submit
    const loginForm = document.getElementById('auth-login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleLogin();
      });
    }

    // Signup Form Submit
    const signupForm = document.getElementById('auth-signup-form');
    if (signupForm) {
      signupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSignup();
      });
    }

    // Forgot Password Form Submit
    const forgotForm = document.getElementById('auth-forgot-form');
    if (forgotForm) {
      forgotForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleForgotPassword();
      });
    }

    // Toggle between Login & Signup
    document.querySelectorAll('.auth-toggle-link').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const target = btn.getAttribute('data-target');
        this.switchAuthMode(target);
      });
    });

    // Forgot password modal open/close
    const openForgotBtn = document.getElementById('auth-open-forgot-btn');
    const closeForgotBtn = document.getElementById('close-forgot-modal-btn');
    const forgotModal = document.getElementById('auth-forgot-modal');

    if (openForgotBtn) {
      openForgotBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (forgotModal) forgotModal.classList.add('active');
      });
    }
    if (closeForgotBtn && forgotModal) {
      closeForgotBtn.addEventListener('click', () => {
        forgotModal.classList.remove('active');
      });
    }

    // Logout button
    document.querySelectorAll('.auth-logout-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleLogout();
      });
    });
  }

  switchAuthMode(mode) {
    this.activeMode = mode;
    const loginContainer = document.getElementById('auth-login-container');
    const signupContainer = document.getElementById('auth-signup-container');
    const authErrorAlert = document.getElementById('auth-error-alert');

    if (authErrorAlert) authErrorAlert.style.display = 'none';

    if (loginContainer && signupContainer) {
      if (mode === 'signup') {
        loginContainer.style.display = 'none';
        signupContainer.style.display = 'block';
      } else {
        loginContainer.style.display = 'block';
        signupContainer.style.display = 'none';
      }
    }
  }

  showError(message) {
    const errorAlert = document.getElementById('auth-error-alert');
    if (errorAlert) {
      errorAlert.textContent = message;
      errorAlert.style.display = 'block';
    } else {
      alert(message);
    }
  }

  clearError() {
    const errorAlert = document.getElementById('auth-error-alert');
    if (errorAlert) errorAlert.style.display = 'none';
  }

  async handleLogin() {
    const emailInput = document.getElementById('login-email');
    const passInput = document.getElementById('login-password');
    const submitBtn = document.getElementById('login-submit-btn');

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passInput ? passInput.value : '';

    if (!email || !password) {
      this.showError('Please enter your email and password.');
      return;
    }

    this.clearError();
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Signing in...';
    }

    try {
      await window.authService.signIn({ email, password });
      this.enterApplication();
    } catch (err) {
      this.showError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Sign In to NexusLead';
      }
    }
  }

  async handleSignup() {
    const nameInput = document.getElementById('signup-name');
    const wsInput = document.getElementById('signup-workspace');
    const emailInput = document.getElementById('signup-email');
    const passInput = document.getElementById('signup-password');
    const submitBtn = document.getElementById('signup-submit-btn');

    const fullName = nameInput ? nameInput.value.trim() : '';
    const workspaceName = wsInput ? wsInput.value.trim() : '';
    const email = emailInput ? emailInput.value.trim() : '';
    const password = passInput ? passInput.value : '';

    if (!fullName || !email || !password) {
      this.showError('Please fill in all required fields.');
      return;
    }

    if (password.length < 6) {
      this.showError('Password must be at least 6 characters long.');
      return;
    }

    this.clearError();
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Creating workspace...';
    }

    try {
      await window.authService.signUp({
        email,
        password,
        fullName,
        workspaceName: workspaceName || `${fullName}'s Workspace`
      });
      this.enterApplication();
    } catch (err) {
      this.showError(err.message || 'Signup failed. Please try again.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Create Free Account';
      }
    }
  }

  async handleForgotPassword() {
    const emailInput = document.getElementById('forgot-email');
    const submitBtn = document.getElementById('forgot-submit-btn');
    const msgEl = document.getElementById('forgot-status-msg');

    const email = emailInput ? emailInput.value.trim() : '';
    if (!email) return;

    if (submitBtn) submitBtn.disabled = true;
    if (msgEl) {
      msgEl.style.color = 'var(--text-muted)';
      msgEl.textContent = 'Sending password reset instructions...';
    }

    try {
      await window.authService.resetPassword(email);
      if (msgEl) {
        msgEl.style.color = 'var(--status-success)';
        msgEl.textContent = 'Check your email for the password reset link.';
      }
    } catch (err) {
      if (msgEl) {
        msgEl.style.color = 'var(--status-danger)';
        msgEl.textContent = err.message || 'Could not send reset email.';
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async handleLogout() {
    await window.authService.signOut();
    this.showAuthScreen();
  }

  checkInitialSession() {
    if (window.authService.isAuthenticated()) {
      this.enterApplication();
    } else {
      this.showAuthScreen();
    }
  }

  handleAuthStateChange(event, session) {
    if (session) {
      this.enterApplication();
    } else {
      this.showAuthScreen();
    }
  }

  enterApplication() {
    const authWrapper = document.getElementById('auth-fullscreen-wrapper');
    const appShell = document.getElementById('app-shell');
    const userProfileEl = document.getElementById('sidebar-user-name');
    const user = window.authService.getUser();

    if (authWrapper) authWrapper.style.display = 'none';
    if (appShell) appShell.style.display = 'flex';

    if (userProfileEl && user) {
      userProfileEl.textContent = user.name || user.email?.split('@')[0] || 'User';
    }

    if (window.navigationComponent && typeof window.navigationComponent.switchView === 'function') {
      window.navigationComponent.switchView('dashboard');
    }
  }

  showAuthScreen() {
    const authWrapper = document.getElementById('auth-fullscreen-wrapper');
    const appShell = document.getElementById('app-shell');

    if (appShell) appShell.style.display = 'none';
    if (authWrapper) authWrapper.style.display = 'flex';
  }
}

window.authComponent = new AuthComponent();
