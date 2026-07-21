import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DrawingToolbar } from '../DrawingToolbar.js';

describe('DrawingToolbar', () => {
  let container;

  beforeEach(() => {
    // Setup a clean DOM
    document.body.innerHTML = '<div id="drawing-toolbar-container"></div>';
    container = document.getElementById('drawing-toolbar-container');
    
    // Mock localStorage
    const store = {};
    vi.stubGlobal('localStorage', {
      getItem: (key) => store[key] || null,
      setItem: (key, value) => { store[key] = value.toString(); },
      clear: () => { Object.keys(store).forEach(key => delete store[key]); }
    });
  });

  it('should initialize and render tool buttons', () => {
    const toolbar = new DrawingToolbar(container, {
      onToolChange: vi.fn(),
      favorites: []
    });

    // It should render group headers and tools
    expect(container.innerHTML).toContain('trendline');
    
    // Check if drawing tools exist
    const toolBtns = container.querySelectorAll('.dtb-tool-btn');
    expect(toolBtns.length).toBeGreaterThan(0);
  });

  it('should handle tool selection', () => {
    const onToolChange = vi.fn();
    const toolbar = new DrawingToolbar(container, {
      onToolChange,
      favorites: []
    });

    const trendlineBtn = container.querySelector('.dtb-tool-btn[data-tool="trendline"]');
    trendlineBtn.click();

    expect(onToolChange).toHaveBeenCalledWith('trendline');
    expect(trendlineBtn.classList.contains('active')).toBe(true);
  });

  it('should toggle favorites when star is clicked', () => {
    const onFavoriteToggle = vi.fn();
    const toolbar = new DrawingToolbar(container, {
      onFavoriteToggle,
      favorites: []
    });

    const starBtn = container.querySelector('.dtb-favorite-btn[data-fav-tool="trendline"]');
    starBtn.click(); // Add to favorites

    expect(onFavoriteToggle).toHaveBeenCalledWith('trendline');
  });
});
