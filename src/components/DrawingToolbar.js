/**
 * TradingView-Style Interactive Drawing Toolbar Component
 * Supports Trendlines, Horizontal Lines, Text Callouts, Zones, and Cloud Persistence
 */

export class DrawingToolbar {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.activeTool = 'select'; // 'select', 'trendline', 'horizontal', 'text', 'zone'
    this.userRole = options.userRole || 'free';
    this.onToolChange = options.onToolChange || (() => {});
    this.onSaveAnnotations = options.onSaveAnnotations || (() => {});
    this.onClearAnnotations = options.onClearAnnotations || (() => {});

    this.render();
  }

  setRole(role) {
    this.userRole = role || 'free';
    this.render();
  }

  setActiveTool(toolName) {
    this.activeTool = toolName;
    const buttons = this.container.querySelectorAll('.tool-btn');
    buttons.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tool') === toolName);
    });
    this.onToolChange(this.activeTool);
  }

  render() {
    const isGated = this.userRole === 'free';
    const lockTitle = isGated ? ' (Requires PRO1 or ADMIN tier plan)' : '';

    this.container.innerHTML = `
      <div class="drawing-toolbar-wrapper">
        <!-- Select / Cursor -->
        <button 
          type="button"
          class="tool-btn ${this.activeTool === 'select' ? 'active' : ''}" 
          data-tool="select"
          title="Pointer / Select Tool">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><path d="M3 3l7 18 3-7 7-3L3 3z"></path></svg>
        </button>

        <div class="tool-divider"></div>

        <!-- Trendline Tool -->
        <button 
          type="button"
          class="tool-btn ${this.activeTool === 'trendline' ? 'active' : ''} ${isGated ? 'gated-btn' : ''}" 
          data-tool="trendline"
          title="Trend Line Tool: Click on chart to place custom slanted line${lockTitle}">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><line x1="4" y1="20" x2="20" y2="4"></line><circle cx="4" cy="20" r="2"></circle><circle cx="20" cy="4" r="2"></circle></svg>
        </button>

        <!-- Horizontal Line Tool -->
        <button 
          type="button"
          class="tool-btn ${this.activeTool === 'horizontal' ? 'active' : ''} ${isGated ? 'gated-btn' : ''}" 
          data-tool="horizontal"
          title="Horizontal Level Tool: Click on price point to draw custom support/resistance line${lockTitle}">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line></svg>
        </button>

        <!-- Text Callout Tool -->
        <button 
          type="button"
          class="tool-btn ${this.activeTool === 'text' ? 'active' : ''} ${isGated ? 'gated-btn' : ''}" 
          data-tool="text"
          title="Text Note Tool: Click on chart to attach custom note / callout${lockTitle}">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        </button>

        <!-- Rectangle / Zone Tool -->
        <button 
          type="button"
          class="tool-btn ${this.activeTool === 'zone' ? 'active' : ''} ${isGated ? 'gated-btn' : ''}" 
          data-tool="zone"
          title="Price Zone / Box Tool: Highlight price accumulation or range box${lockTitle}">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
        </button>

        <div class="tool-divider"></div>

        <!-- Clear All Tool -->
        <button 
          type="button"
          class="tool-btn clear-tool-btn" 
          id="clear-annotations-btn"
          title="Clear Custom Drawings: Erase custom drawings for this symbol">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>

        <!-- Cloud Save Tool -->
        <button 
          type="button"
          class="tool-btn save-tool-btn ${isGated ? 'gated-btn' : ''}" 
          id="save-annotations-btn"
          title="Save Drawings to Account: Cloud sync annotations to your Supabase profile${lockTitle}">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
        </button>
      </div>
    `;

    this.attachEvents();
  }

  attachEvents() {
    const buttons = this.container.querySelectorAll('.tool-btn[data-tool]');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.getAttribute('data-tool');
        this.setActiveTool(tool);
      });
    });

    const clearBtn = this.container.querySelector('#clear-annotations-btn');
    clearBtn?.addEventListener('click', () => {
      this.onClearAnnotations();
    });

    const saveBtn = this.container.querySelector('#save-annotations-btn');
    saveBtn?.addEventListener('click', () => {
      this.onSaveAnnotations();
    });
  }
}
