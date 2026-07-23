import { describe, it, expect, vi } from 'vitest';
import { ChartViewer } from '../ChartViewer.js';

describe('ChartViewer renderSRLines', () => {
  it('should render SR lines without crashing on duplicate times (1 bounce)', () => {
    // We mock the properties and methods needed by renderSRLines
    const mockLineSeries = {
      setData: vi.fn(),
    };
    
    const mockChart = {
      addLineSeries: vi.fn(() => mockLineSeries),
      removeSeries: vi.fn(),
    };

    const viewer = {
      chart: mockChart,
      priceLines: [],
      trendlineSeriesList: [],
      candlestickSeries: {
        removePriceLine: vi.fn(),
        setMarkers: vi.fn(),
        createPriceLine: vi.fn(() => ({})),
      },
      currentCandles: [
        { time: 1500000000, open: 1, high: 2, low: 1, close: 1 },
        { time: 1700000000, open: 1, high: 2, low: 1, close: 1 }
      ],
      extendedPriceKeys: new Set(),
      combineAndSetMarkers: vi.fn(),
      setupInteractiveLineTouch: vi.fn(),
      // Attach the real renderSRLines method to our mock viewer
      renderSRLines: ChartViewer.prototype.renderSRLines
    };

    const srData = {
      showSupport: true,
      supportLines: [
        {
          id: 'test-1',
          price: 50000,
          type: 'SUPPORT',
          bounces: 1,
          isSlanted: false,
          bounceDetails: [
            { index: 100, time: 1600000000, price: 50000 }
          ]
        }
      ]
    };

    expect(() => viewer.renderSRLines(srData)).not.toThrow();

    expect(mockChart.addLineSeries).toHaveBeenCalled();
    expect(mockLineSeries.setData).toHaveBeenCalled();

    const dataArgs = mockLineSeries.setData.mock.calls[0][0];
    expect(dataArgs.length).toBe(2);
    expect(dataArgs[0].time).toBeLessThan(dataArgs[1].time);
  });
});
