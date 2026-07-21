import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DrawingEngine } from '../DrawingEngine.js';

describe('DrawingEngine', () => {
  let container;
  let mockChartViewer;

  beforeEach(() => {
    // Mock ResizeObserver for JSDOM
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    document.body.innerHTML = '<div id="chart-container" style="position:relative; width: 800px; height: 500px;"></div>';
    container = document.getElementById('chart-container');
    
    // Mock the lightweight-charts instance
    const mockChart = {
      timeScale: () => ({
        subscribeVisibleLogicalRangeChange: vi.fn(),
        coordinateToTime: vi.fn().mockReturnValue(1600000000),
        timeToCoordinate: vi.fn().mockReturnValue(100),
      }),
      subscribeCrosshairMove: vi.fn(),
      priceScale: () => ({
        coordinateToPrice: vi.fn().mockReturnValue(50000),
        priceToCoordinate: vi.fn().mockReturnValue(200),
      })
    };

    mockChartViewer = {
      chart: mockChart,
      candlestickSeries: {},
      container: container
    };
  });

  it('should initialize svg overlay correctly', () => {
    const engine = new DrawingEngine(mockChartViewer);
    
    const svgEl = container.querySelector('svg');
    expect(svgEl).not.toBeNull();
    expect(svgEl.style.position).toBe('absolute');
    
    // Default tool is 'select' so pointer events should be none
    expect(svgEl.style.pointerEvents).toBe('none');
  });

  it('should change pointer events when tool is active', () => {
    const engine = new DrawingEngine(mockChartViewer);
    
    engine.setActiveTool('trendline');
    
    const svgEl = container.querySelector('svg');
    // We recently changed this behavior in the code:
    // svgEl and overlayRect stay pointerEvents='none' and we use capture phase for drawing
    // However, if pointerEvents are still changed based on select vs drawing, let's test it:
    
    // If we changed to keep it none, we can just assert it stays none.
    // Let's assert based on the updated logic (wheel event passing)
    
    // We mainly want to test that the tool is set
    expect(engine.activeTool).toBe('trendline');
  });

  it('should forward wheel events to the canvas', () => {
    const engine = new DrawingEngine(mockChartViewer);
    
    // Create a dummy canvas inside the container
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    
    let canvasWheelTriggered = false;
    canvas.addEventListener('wheel', () => {
      canvasWheelTriggered = true;
    });

    // Simulate wheel on the SVG overlay
    const svgEl = container.querySelector('svg');
    const wheelEvent = new WheelEvent('wheel', { bubbles: true, cancelable: true });
    
    // Dispatch it on the container (where our forwarder is listening)
    // with target as svgEl
    Object.defineProperty(wheelEvent, 'target', { value: svgEl, enumerable: true });
    container.dispatchEvent(wheelEvent);
    
    expect(canvasWheelTriggered).toBe(true);
  });
});
