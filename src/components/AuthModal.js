/**
 * Auth Modal & Profile Header Component
 * Handles Sign In, Sign Up with Searchable Country & Country Code Picker,
 * Sample Phone Format Validation, Postal Code, Region, Age, User Roles, and Logout.
 */
import { signUpUser, signInUser, signOutUser } from '../api/supabaseClient.js';

export const COUNTRIES = [
  { code: '+1', name: 'United States (+1)', sample: '+1 555-123-4567' },
  { code: '+44', name: 'United Kingdom (+44)', sample: '+44 7911-123456' },
  { code: '+1', name: 'Canada (+1)', sample: '+1 416-555-0199' },
  { code: '+61', name: 'Australia (+61)', sample: '+61 412-345-678' },
  { code: '+91', name: 'India (+91)', sample: '+91 98765-43210' },
  { code: '+94', name: 'Sri Lanka (+94)', sample: '+94 77-123-4567' },
  { code: '+65', name: 'Singapore (+65)', sample: '+65 9123-4567' },
  { code: '+49', name: 'Germany (+49)', sample: '+49 151-12345678' },
  { code: '+33', name: 'France (+33)', sample: '+33 6-12-34-56-78' },
  { code: '+81', name: 'Japan (+81)', sample: '+81 90-1234-5678' },
  { code: '+971', name: 'UAE (+971)', sample: '+971 50-123-4567' },
  { code: '+55', name: 'Brazil (+55)', sample: '+55 11 91234-5678' },
  { code: '+52', name: 'Mexico (+52)', sample: '+52 55 1234 5678' },
  { code: '+27', name: 'South Africa (+27)', sample: '+27 82 123 4567' },
  { code: '+39', name: 'Italy (+39)', sample: '+39 312 345 6789' },
  { code: '+34', name: 'Spain (+34)', sample: '+34 612 34 56 78' },
  { code: '+31', name: 'Netherlands (+31)', sample: '+31 6 12345678' },
  { code: '+41', name: 'Switzerland (+41)', sample: '+41 79 123 45 67' },
  { code: '+64', name: 'New Zealand (+64)', sample: '+64 21 123 4567' },
  { code: '+82', name: 'South Korea (+82)', sample: '+82 10-1234-5678' },
  { code: '+60', name: 'Malaysia (+60)', sample: '+60 12-345 6789' },
  { code: '+62', name: 'Indonesia (+62)', sample: '+62 812-3456-7890' },
  { code: '+63', name: 'Philippines (+63)', sample: '+63 917 123 4567' },
  { code: '+66', name: 'Thailand (+66)', sample: '+66 81 234 5678' },
  { code: '+84', name: 'Vietnam (+84)', sample: '+84 91 234 56 78' },
  { code: '+90', name: 'Turkey (+90)', sample: '+90 532 123 4567' },
  { code: '+966', name: 'Saudi Arabia (+966)', sample: '+966 50 123 4567' },
  { code: '+92', name: 'Pakistan (+92)', sample: '+92 300 1234567' },
  { code: '+880', name: 'Bangladesh (+880)', sample: '+880 1712-345678' },
  { code: '+234', name: 'Nigeria (+234)', sample: '+234 802 123 4567' },
  { code: '+254', name: 'Kenya (+254)', sample: '+254 712 345678' }
];

export class AuthModal {
  constructor(headerContainer, options = {}) {
    this.container = headerContainer;
    this.user = options.user || null;
    this.profile = options.profile || { role: 'free' };
    this.onAuthChange = options.onAuthChange || (() => {});
    this.onOpenAdmin = options.onOpenAdmin || (() => {});
    this.activeTab = 'signin';
    this.isOpen = false;

    this.renderHeader();
    this.renderModal();
  }

  updateUser(user, profile) {
    this.user = user;
    this.profile = profile || { role: 'free' };
    this.renderHeader();
  }

  renderHeader() {
    let userHtml = '';

    if (this.user) {
      const role = (this.profile?.role || 'free').toUpperCase();
      const roleClass = role === 'ADMIN' ? 'role-admin' : (role === 'PRO1' ? 'role-pro' : 'role-free');

      userHtml = `
        <div class="user-profile-pill">
          <span class="user-email" title="${this.user.email}">${this.user.email}</span>
          <span class="role-badge ${roleClass}" title="User Tier Plan">${role}</span>
          ${role === 'ADMIN' ? `
            <button id="admin-panel-btn" class="admin-btn" title="Open Admin Role Management Panel"><i data-lucide="settings" style="width: 14px; height: 14px; margin-right: 4px;"></i> Admin</button>
          ` : ''}
          <button id="logout-btn" class="logout-btn" title="Sign Out">Logout</button>
        </div>
      `;
    } else {
      userHtml = `
        <button id="login-modal-btn" class="auth-trigger-btn" title="Sign In or Create Account">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>
          Sign In / Register
        </button>
      `;
    }

    this.container.innerHTML = userHtml;

    const loginModalBtn = this.container.querySelector('#login-modal-btn');
    loginModalBtn?.addEventListener('click', () => this.openModal());

    const logoutBtn = this.container.querySelector('#logout-btn');
    logoutBtn?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await signOutUser();
      } catch(err) {
        console.error("Logout error", err);
      }
      // Force a hard reload to guarantee clean state
      window.location.reload();
    });

    const adminBtn = this.container.querySelector('#admin-panel-btn');
    adminBtn?.addEventListener('click', () => {
      this.onOpenAdmin();
    });
  }

  renderModal() {
    let modalOverlay = document.getElementById('auth-modal-overlay');
    if (!modalOverlay) {
      modalOverlay = document.createElement('div');
      modalOverlay.id = 'auth-modal-overlay';
      modalOverlay.className = 'modal-overlay hidden';
      document.body.appendChild(modalOverlay);
    }

    const isSignUp = this.activeTab === 'signup';

    modalOverlay.innerHTML = `
      <div class="modal-card ${isSignUp ? 'signup-card-wide' : ''}">
        <button class="modal-close-btn" id="close-modal-x">&times;</button>
        
        <div class="modal-tabs">
          <button class="tab-btn ${this.activeTab === 'signin' ? 'active' : ''}" id="tab-signin">Sign In</button>
          <button class="tab-btn ${this.activeTab === 'signup' ? 'active' : ''}" id="tab-signup">Register Account</button>
        </div>

        <form id="auth-form" class="auth-form">
          <div class="form-group">
            <label class="form-label">Email Address *</label>
            <input type="email" id="auth-email" class="form-input" placeholder="user@example.com" required />
          </div>

          <div class="form-group">
            <label class="form-label">Password *</label>
            <input type="password" id="auth-password" class="form-input" placeholder="••••••••" required minlength="6" />
          </div>

          ${isSignUp ? `
            <div class="form-row">
              <div class="form-group flex-1">
                <label class="form-label">Search & Select Country *</label>
                <input 
                  type="text" 
                  id="auth-country-search" 
                  list="country-list" 
                  class="form-input" 
                  placeholder="Type to search country, e.g. United, +94, India..." 
                  value="United States (+1)"
                  required 
                />
                <datalist id="country-list">
                  ${COUNTRIES.map(c => `
                    <option value="${c.name}"></option>
                  `).join('')}
                </datalist>
                <small class="form-helper">Type country name or code to filter</small>
              </div>

              <div class="form-group flex-1">
                <label class="form-label">Phone Number (Strict Format) *</label>
                <input 
                  type="text" 
                  id="auth-phone" 
                  class="form-input" 
                  placeholder="Sample: +1 555-123-4567" 
                  value="+1 "
                  required 
                />
                <small class="form-helper" id="phone-helper-text">Required sample format: +1 555-123-4567</small>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group flex-1">
                <label class="form-label">Region / State *</label>
                <input type="text" id="auth-region" class="form-input" placeholder="e.g. California, London" required />
              </div>

              <div class="form-group flex-1">
                <label class="form-label">Postal / ZIP Code *</label>
                <input type="text" id="auth-postal" class="form-input" placeholder="e.g. 90210, 10001" required />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Age (Must be 18+) *</label>
              <input type="number" id="auth-age" class="form-input" min="18" max="120" placeholder="e.g. 25" required />
            </div>
          ` : ''}

          <div id="auth-error" class="auth-error-msg hidden"></div>

          <button type="submit" id="auth-submit-btn" class="auth-submit-btn">
            ${isSignUp ? 'Complete Registration' : 'Sign In to Account'}
          </button>
        </form>
      </div>
    `;

    this.attachModalEvents(modalOverlay);
  }

  attachModalEvents(overlay) {
    const closeBtn = overlay.querySelector('#close-modal-x');
    closeBtn?.addEventListener('click', () => this.closeModal());

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeModal();
    });

    const tabSignin = overlay.querySelector('#tab-signin');
    const tabSignup = overlay.querySelector('#tab-signup');

    tabSignin?.addEventListener('click', () => {
      this.activeTab = 'signin';
      this.renderModal();
      this.openModal();
    });

    tabSignup?.addEventListener('click', () => {
      this.activeTab = 'signup';
      this.renderModal();
      this.openModal();
    });

    // Searchable Country Input change/input listener
    const countrySearchInput = overlay.querySelector('#auth-country-search');
    const phoneInput = overlay.querySelector('#auth-phone');
    const phoneHelper = overlay.querySelector('#phone-helper-text');

    if (countrySearchInput && phoneInput && phoneHelper) {
      const handleCountryMatch = () => {
        const val = countrySearchInput.value.trim().toLowerCase();
        const matched = COUNTRIES.find(c => 
          c.name.toLowerCase() === val || 
          c.name.toLowerCase().includes(val) || 
          c.code.toLowerCase() === val
        );

        if (matched) {
          phoneInput.placeholder = `Sample: ${matched.sample}`;
          phoneHelper.textContent = `Required sample format: ${matched.sample}`;

          // Auto prefix phone number if user hasn't typed rest
          if (!phoneInput.value || phoneInput.value === '+1 ' || phoneInput.value.startsWith('+')) {
            phoneInput.value = `${matched.code} `;
          }
        }
      };

      countrySearchInput.addEventListener('input', handleCountryMatch);
      countrySearchInput.addEventListener('change', handleCountryMatch);
    }

    const form = overlay.querySelector('#auth-form');
    const errorElem = overlay.querySelector('#auth-error');
    const submitBtn = overlay.querySelector('#auth-submit-btn');

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = overlay.querySelector('#auth-email').value.trim();
      const password = overlay.querySelector('#auth-password').value;

      errorElem.classList.add('hidden');

      if (this.activeTab === 'signup') {
        const typedCountry = overlay.querySelector('#auth-country-search').value.trim();
        const matchedCountry = COUNTRIES.find(c => c.name.toLowerCase() === typedCountry.toLowerCase()) || 
                               COUNTRIES.find(c => typedCountry.toLowerCase().includes(c.code.toLowerCase())) ||
                               COUNTRIES[0];

        const country_code = matchedCountry.code;
        const country_name = matchedCountry.name;

        const phone_number = overlay.querySelector('#auth-phone').value.trim();
        const region = overlay.querySelector('#auth-region').value.trim();
        const postal_code = overlay.querySelector('#auth-postal').value.trim();
        const ageVal = parseInt(overlay.querySelector('#auth-age').value, 10);

        // Strict Phone Format Validation
        const cleanPhoneNoSpace = phone_number.replace(/[\s-]/g, '');
        if (!phone_number.startsWith('+') || cleanPhoneNoSpace.length < 9) {
          errorElem.textContent = `Invalid Phone Format! Phone number must follow the sample format starting with country code (e.g. ${country_code} 555-123-4567). Cannot register without correct sample format!`;
          errorElem.classList.remove('hidden');
          return;
        }

        if (isNaN(ageVal) || ageVal < 18) {
          errorElem.textContent = 'Age must be 18 or older to register on the platform.';
          errorElem.classList.remove('hidden');
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating Account...';

        try {
          const metadata = {
            country_code,
            country_name,
            phone_number,
            postal_code,
            region,
            age: ageVal
          };

          const authResult = await signUpUser(email, password, metadata);
          const user = authResult.user || authResult.session?.user;

          if (authResult.session) {
            // Direct session created
            this.closeModal();
            this.onAuthChange(user);
          } else {
            // Email confirmation required
            errorElem.className = 'auth-success-msg';
            errorElem.innerHTML = `
              <strong><i data-lucide="mail" style="width: 14px; height: 14px; margin-right: 4px;"></i> Confirmation Email Sent!</strong><br/>
              A verification link has been sent to <strong>${email}</strong>.<br/>
              Please check your inbox (and spam folder) and click the link to confirm your registration.
            `;
            errorElem.classList.remove('hidden');
          }

        } catch (err) {
          if (err.message && err.message.toLowerCase().includes('api key')) {
            errorElem.innerHTML = `
              <strong>Invalid Supabase API Key!</strong><br/>
              Please copy your actual <code>anon</code> <code>public</code> API Key from your <a href="https://supabase.com/dashboard/project/sucurpxaeojyawgherrf/settings/api" target="_blank" style="color: #60a5fa; text-decoration: underline;">Supabase Dashboard (Project Settings ➔ API)</a> and paste it into your <code>.env</code> file.
            `;
          } else {
            let errorText = err.message || err.error_description || 'Registration failed.';
            if (errorText === '{}' || errorText === '[object Object]') {
              errorText = 'Registration failed. A user with this phone number or email may already exist, or the server rejected the request.';
            }
            errorElem.textContent = errorText;
          }
          errorElem.classList.remove('hidden');
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Complete Registration';
        }

      } else {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing In...';

        try {
          const authResult = await signInUser(email, password);
          const user = authResult.user || authResult.session?.user;
          this.closeModal();
          this.onAuthChange(user);

        } catch (err) {
          errorElem.textContent = err.message || 'Authentication failed.';
          errorElem.classList.remove('hidden');
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign In to Account';
        }
      }
    });
  }

  openModal() {
    const overlay = document.getElementById('auth-modal-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      this.isOpen = true;
    }
  }

  closeModal() {
    const overlay = document.getElementById('auth-modal-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
      this.isOpen = false;
    }
  }
}
