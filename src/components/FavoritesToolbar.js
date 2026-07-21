export class FavoritesToolbar {
  constructor(options = {}) {
    this.onToolChange = options.onToolChange || (() => {});
    this.favorites = options.favorites || [];
    this.activeTool = options.activeTool || 'select';
    
    // Tools map to get SVG icons and titles
    this.toolsMap = options.toolsMap || {};
    
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.position = { x: 100, y: 100 }; // Default position
    
    this.container = document.createElement('div');
    this.container.id = 'favorites-floating-toolbar';
    this.container.className = 'favorites-floating-toolbar';
    document.body.appendChild(this.container);

    this.loadPosition();
    this.render();
    this.attachDragEvents();
  }

  loadPosition() {
    try {
      const saved = localStorage.getItem('tradeLine_fav_pos');
      if (saved) {
        this.position = JSON.parse(saved);
        this.updatePosition();
      }
    } catch (e) {
      console.warn('Failed to load favorites toolbar position');
    }
  }

  savePosition() {
    try {
      localStorage.setItem('tradeLine_fav_pos', JSON.stringify(this.position));
    } catch (e) {
      // ignore
    }
  }

  updatePosition() {
    this.container.style.left = `${this.position.x}px`;
    this.container.style.top = `${this.position.y}px`;
  }

  setFavorites(favorites) {
    this.favorites = favorites;
    this.render();
  }

  setActiveTool(tool) {
    this.activeTool = tool;
    this.refreshActiveState();
  }

  refreshActiveState() {
    const btns = this.container.querySelectorAll('.fav-tool-btn');
    btns.forEach(b => b.classList.toggle('active', b.dataset.tool === this.activeTool));
  }

  render() {
    // Hide entirely if no favorites
    if (!this.favorites || this.favorites.length === 0) {
      this.container.style.display = 'none';
      return;
    }
    
    this.container.style.display = 'flex';

    let html = `
      <div class="fav-drag-handle" title="Drag to move">
        <i data-lucide="grip-vertical" style="width: 14px; height: 14px;"></i>
      </div>
      <div class="fav-tools-container">
    `;

    this.favorites.forEach(toolId => {
      const toolData = this.toolsMap[toolId];
      if (toolData) {
        html += `
          <button class="fav-tool-btn ${this.activeTool === toolId ? 'active' : ''}" 
                  data-tool="${toolId}" 
                  title="${toolData.title}">
            ${toolData.svg}
          </button>
        `;
      }
    });

    html += `</div>`;
    this.container.innerHTML = html;

    // Attach click events to tool buttons
    this.container.querySelectorAll('.fav-tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTool = btn.dataset.tool;
        this.refreshActiveState();
        this.onToolChange(this.activeTool);
      });
    });

    // Refresh lucide icons
    if (window.refreshIcons) {
      setTimeout(() => window.refreshIcons(), 0);
    }
  }

  attachDragEvents() {
    // Desktop mouse events
    this.container.addEventListener('mousedown', (e) => this.onDragStart(e));
    document.addEventListener('mousemove', (e) => this.onDragMove(e));
    document.addEventListener('mouseup', () => this.onDragEnd());

    // Mobile touch events
    this.container.addEventListener('touchstart', (e) => this.onDragStart(e), { passive: false });
    document.addEventListener('touchmove', (e) => this.onDragMove(e), { passive: false });
    document.addEventListener('touchend', () => this.onDragEnd());
  }

  onDragStart(e) {
    if (!e.target.closest('.fav-drag-handle')) return;
    
    this.isDragging = true;
    this.container.classList.add('is-dragging');
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const rect = this.container.getBoundingClientRect();
    this.dragOffset.x = clientX - rect.left;
    this.dragOffset.y = clientY - rect.top;
    
    // Prevent text selection while dragging
    if (e.preventDefault && !e.touches) e.preventDefault();
  }

  onDragMove(e) {
    if (!this.isDragging) return;
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    // Calculate new position
    let newX = clientX - this.dragOffset.x;
    let newY = clientY - this.dragOffset.y;
    
    // Clamp to viewport
    const maxX = window.innerWidth - this.container.offsetWidth;
    const maxY = window.innerHeight - this.container.offsetHeight;
    
    this.position.x = Math.max(0, Math.min(newX, maxX));
    this.position.y = Math.max(0, Math.min(newY, maxY));
    
    this.updatePosition();
    
    if (e.preventDefault) e.preventDefault(); // Prevent scrolling on mobile
  }

  onDragEnd() {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.container.classList.remove('is-dragging');
    this.savePosition();
  }

  destroy() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
