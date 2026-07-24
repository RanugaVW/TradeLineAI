/**
 * Admin Panel Component
 * Role-Based Access Control (RBAC) Management for Admins (assign free, pro1, admin roles)
 * Displays User Email, Tier, Country, Sample Phone, Region, Postal Code, and Age
 */
import { fetchAllProfiles, updateUserRole } from '../api/supabaseClient.js';

export class AdminPanel {
  constructor(options = {}) {
    this.profiles = [];
    this.isOpen = false;
    this.onRoleUpdated = options.onRoleUpdated || (() => {});
    this.createModalDOM();
  }

  createModalDOM() {
    let modalOverlay = document.getElementById('admin-modal-overlay');
    if (!modalOverlay) {
      modalOverlay = document.createElement('div');
      modalOverlay.id = 'admin-modal-overlay';
      modalOverlay.className = 'modal-overlay hidden';
      document.body.appendChild(modalOverlay);
    }
    this.overlay = modalOverlay;
  }

  async open() {
    this.isOpen = true;
    this.overlay.classList.remove('hidden');
    this.renderLoading();
    try {
      this.profiles = await fetchAllProfiles();
      this.render();
    } catch (err) {
      this.renderError(err.message);
    }
  }

  close() {
    this.isOpen = false;
    this.overlay.classList.add('hidden');
  }

  renderLoading() {
    this.overlay.innerHTML = `
      <div class="modal-card admin-card">
        <button class="modal-close-btn" id="close-admin-x">&times;</button>
        <h3 class="admin-title">Admin User & Role Control Panel</h3>
        <p class="empty-state">Loading user profiles from Supabase database...</p>
      </div>
    `;
    this.overlay.querySelector('#close-admin-x')?.addEventListener('click', () => this.close());
  }

  renderError(msg) {
    this.overlay.innerHTML = `
      <div class="modal-card admin-card">
        <button class="modal-close-btn" id="close-admin-x">&times;</button>
        <h3 class="admin-title">Admin User & Role Control Panel</h3>
        <div class="auth-error-msg">Failed to load profiles: ${msg}</div>
        <p class="empty-state">Ensure you have run <code>schema.sql</code> in your Supabase SQL Editor.</p>
      </div>
    `;
    this.overlay.querySelector('#close-admin-x')?.addEventListener('click', () => this.close());
  }

  render() {
    this.overlay.innerHTML = `
      <div class="modal-card admin-card wide-admin-card">
        <div class="admin-header">
          <div>
            <h3 class="admin-title">Admin User Role Control Panel</h3>
            <p class="admin-sub">Assign 3-tier roles (Free, Pro1, Admin) and view registered user details</p>
          </div>
          <button class="modal-close-btn" id="close-admin-x">&times;</button>
        </div>

        <div class="table-wrapper admin-table-wrapper">
          <table class="levels-table admin-table">
            <thead>
              <tr>
                <th>User Email</th>
                <th>Country & Phone</th>
                <th>Region & Postal</th>
                <th>Age</th>
                <th>Current Tier</th>
                <th>Assign Role</th>
              </tr>
            </thead>
            <tbody>
              ${this.profiles.length === 0 ? `
                <tr><td colspan="6" class="empty-state">No user profiles found in database.</td></tr>
              ` : this.profiles.map(p => `
                <tr>
                  <td>
                    <span class="user-email-cell">${p.email}</span>
                  </td>
                  <td>
                    <div class="user-sub-info">
                      <span class="bold-text">${p.country_name || p.country_code || 'N/A'}</span>
                      <small class="phone-text">${p.phone_number || 'No Phone'}</small>
                    </div>
                  </td>
                  <td>
                    <div class="user-sub-info">
                      <span>${p.region || 'N/A'}</span>
                      <small class="text-muted">Postal: ${p.postal_code || 'N/A'}</small>
                    </div>
                  </td>
                  <td>
                    <span>${p.age ? `${p.age} yrs` : 'N/A'}</span>
                  </td>
                  <td>
                    <span class="role-badge ${p.role === 'admin' ? 'role-admin' : (p.role === 'pro1' ? 'role-pro' : 'role-free')}">
                      ${(p.role || 'free').toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <select class="custom-select role-select" data-user-id="${p.id}" style="margin-right: 8px;">
                      <option value="free" ${p.role === 'free' ? 'selected' : ''}>Free Tier</option>
                      <option value="pro1" ${p.role === 'pro1' ? 'selected' : ''}>Pro1 Tier</option>
                      <option value="admin" ${p.role === 'admin' ? 'selected' : ''}>Admin Tier</option>
                    </select>
                    <button class="delete-user-btn" data-user-id="${p.id}" title="Delete User Account" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); padding: 6px 12px; border-radius: 6px; cursor: pointer; transition: all 0.2s;">
                      Delete
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    this.attachEvents();
  }

  attachEvents() {
    this.overlay.querySelector('#close-admin-x')?.addEventListener('click', () => this.close());

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    const selects = this.overlay.querySelectorAll('.role-select');
    selects.forEach(select => {
      select.addEventListener('change', async (e) => {
        const userId = e.target.getAttribute('data-user-id');
        const newRole = e.target.value;
        const originalValue = this.profiles.find(p => p.id === userId)?.role || 'free';
        
        try {
          // Disable select while updating
          e.target.disabled = true;
          const { updateUserRole } = await import('../api/supabaseClient.js');
          await updateUserRole(userId, newRole);
          
          // Update local state
          const pIdx = this.profiles.findIndex(p => p.id === userId);
          if (pIdx > -1) this.profiles[pIdx].role = newRole;
          
          // Refresh UI to show new badge
          this.onRoleUpdated(userId, newRole);
          this.render();
          
          // Show quick toast notification
          alert(`Success! User role updated to ${newRole.toUpperCase()}.`);
        } catch (err) {
          console.error('Role update failed:', err);
          alert('Failed to update user role: ' + err.message);
          e.target.value = originalValue; // revert on fail
        } finally {
          e.target.disabled = false;
        }
      });
    });

    const deleteBtns = this.overlay.querySelectorAll('.delete-user-btn');
    deleteBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const userId = e.target.getAttribute('data-user-id');
        const userEmail = this.profiles.find(p => p.id === userId)?.email || 'this user';
        
        if (confirm(`Are you absolutely sure you want to completely delete ${userEmail}? This action cannot be undone.`)) {
          try {
            e.target.disabled = true;
            e.target.textContent = 'Deleting...';
            const { deleteUserAccount } = await import('../api/supabaseClient.js');
            await deleteUserAccount(userId);
            
            this.profiles = this.profiles.filter(p => p.id !== userId);
            this.render();
            alert('User successfully deleted.');
          } catch (err) {
            console.error('Delete user failed:', err);
            alert('Failed to delete user: ' + err.message);
            e.target.disabled = false;
            e.target.textContent = 'Delete';
          }
        }
      });
    });
  }
}
