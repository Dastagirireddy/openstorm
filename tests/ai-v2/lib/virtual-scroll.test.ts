import { describe, it, expect, beforeEach } from 'vitest';
import { VirtualScrollController } from '../../../src/components/ai-v2/lib/virtual-scroll.js';

describe('VirtualScrollController', () => {
  let controller: VirtualScrollController;

  beforeEach(() => {
    controller = new VirtualScrollController({ itemHeight: 50, buffer: 5 });
  });

  it('initializes with empty items and default range', () => {
    expect(controller.items).toEqual([]);
    expect(controller.visibleRange).toEqual({ start: 0, end: 50 });
    expect(controller.itemHeight).toBe(50);
    expect(controller.buffer).toBe(5);
  });

  it('setItems stores items', () => {
    controller.setItems([1, 2, 3, 4, 5]);
    expect(controller.items).toEqual([1, 2, 3, 4, 5]);
  });

  it('setItems creates a copy (not reference)', () => {
    const arr = [1, 2, 3];
    controller.setItems(arr);
    arr.push(4);
    expect(controller.items).toEqual([1, 2, 3]);
  });

  describe('onScroll', () => {
    it('calculates visible range from scroll position', () => {
      controller.setItems(Array.from({ length: 100 }, (_, i) => i));
      controller.onScroll(200, 400); // scrollTop=200, height=400
      expect(controller.visibleRange).toEqual({ start: 4, end: 12 });
    });

    it('handles scrollTop=0', () => {
      controller.setItems(Array.from({ length: 100 }, (_, i) => i));
      controller.onScroll(0, 400);
      expect(controller.visibleRange).toEqual({ start: 0, end: 8 });
    });
  });

  describe('getVisibleItems', () => {
    it('returns items within range plus buffer', () => {
      const items = Array.from({ length: 100 }, (_, i) => i);
      controller.setItems(items);
      controller.onScroll(200, 400); // range: 4-12, buffer: 5 -> slice(0, 17)

      const visible = controller.getVisibleItems();
      expect(visible[0]).toBe(0);
      expect(visible.length).toBe(17); // items 0..16
    });

    it('clamps start to 0', () => {
      const items = Array.from({ length: 10 }, (_, i) => i);
      controller.setItems(items);
      controller.onScroll(0, 400); // range: 0-8, buffer: 5 -> slice(0, 13)

      const visible = controller.getVisibleItems();
      expect(visible[0]).toBe(0);
    });

    it('clamps end to items.length', () => {
      const items = Array.from({ length: 5 }, (_, i) => i);
      controller.setItems(items);
      controller.onScroll(0, 400);

      const visible = controller.getVisibleItems();
      expect(visible).toEqual([0, 1, 2, 3, 4]);
    });
  });

  describe('getTopSpacer', () => {
    it('returns correct height for scrolled position', () => {
      controller.setItems(Array.from({ length: 100 }, (_, i) => i));
      controller.onScroll(200, 400); // start=4, buffer=5 -> topSpacer = max(0, 4-5) * 50 = 0
      expect(controller.getTopSpacer()).toBe(0);
    });

    it('returns positive spacer when scrolled far', () => {
      controller.setItems(Array.from({ length: 100 }, (_, i) => i));
      controller.onScroll(500, 400); // start=10, buffer=5 -> topSpacer = max(0, 10-5) * 50 = 250
      expect(controller.getTopSpacer()).toBe(250);
    });
  });

  describe('getBottomSpacer', () => {
    it('returns correct height for remaining items', () => {
      controller.setItems(Array.from({ length: 100 }, (_, i) => i));
      controller.onScroll(0, 400); // end=8, buffer=5 -> bottomSpacer = max(0, 100-8-5) * 50 = 4350
      expect(controller.getBottomSpacer()).toBe(4350);
    });

    it('returns 0 when near bottom', () => {
      controller.setItems(Array.from({ length: 5 }, (_, i) => i));
      controller.onScroll(0, 400); // end=8, buffer=5 -> max(0, 5-8-5) * 50 = 0
      expect(controller.getBottomSpacer()).toBe(0);
    });
  });

  describe('getTotalHeight', () => {
    it('returns items.length * itemHeight', () => {
      controller.setItems(Array.from({ length: 20 }, (_, i) => i));
      expect(controller.getTotalHeight()).toBe(1000);
    });

    it('returns 0 for empty items', () => {
      expect(controller.getTotalHeight()).toBe(0);
    });
  });
});
