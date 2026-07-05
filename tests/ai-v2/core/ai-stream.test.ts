import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StreamingController } from '../../../src/components/ai-v2/core/ai-stream.js';

describe('StreamingController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createController(overrides: Partial<{ debounceMs: number }> = {}) {
    const onDelta = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    const controller = new StreamingController({
      debounceMs: overrides.debounceMs ?? 16,
      onDelta,
      onComplete,
      onError,
    });
    return { controller, onDelta, onComplete, onError };
  }

  it('initializes inactive with empty buffer', () => {
    const { controller } = createController();
    expect(controller.active).toBe(false);
    expect(controller.buffer).toBe('');
    expect(controller.messageId).toBe('');
  });

  it('start sets messageId and activates', () => {
    const { controller } = createController();
    controller.start('msg-1');
    expect(controller.active).toBe(true);
    expect(controller.messageId).toBe('msg-1');
    expect(controller.buffer).toBe('');
  });

  it('append accumulates buffer and triggers debounced delta', () => {
    const { controller, onDelta } = createController({ debounceMs: 50 });
    controller.start('msg-1');
    controller.append('Hello');
    controller.append(' World');

    expect(controller.buffer).toBe('Hello World');
    // Delta not fired yet (debounced)
    expect(onDelta).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(onDelta).toHaveBeenCalledOnce();
    expect(onDelta).toHaveBeenCalledWith({
      content: 'Hello World',
      messageId: 'msg-1',
      done: false,
    });
  });

  it('complete flushes and calls onComplete', () => {
    const { controller, onDelta, onComplete } = createController();
    controller.start('msg-2');
    controller.append('done');
    controller.complete();

    expect(controller.active).toBe(false);
    expect(onDelta).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith('msg-2', 'done');
  });

  it('error calls onError and deactivates', () => {
    const { controller, onError } = createController();
    controller.start('msg-3');
    controller.error('something broke');

    expect(controller.active).toBe(false);
    expect(onError).toHaveBeenCalledWith('something broke');
  });

  it('abort deactivates without completing', () => {
    const { controller, onComplete } = createController();
    controller.start('msg-4');
    controller.abort();

    expect(controller.active).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('reset clears everything', () => {
    const { controller } = createController();
    controller.start('msg-5');
    controller.append('data');
    controller.reset();

    expect(controller.active).toBe(false);
    expect(controller.buffer).toBe('');
    expect(controller.messageId).toBe('');
  });

  it('append does nothing when inactive', () => {
    const { controller, onDelta } = createController();
    controller.append('ignored');
    vi.advanceTimersByTime(100);
    expect(onDelta).not.toHaveBeenCalled();
  });

  it('multiple appends batch into single delta', () => {
    const { controller, onDelta } = createController({ debounceMs: 30 });
    controller.start('msg-6');
    controller.append('a');
    controller.append('b');
    controller.append('c');
    vi.advanceTimersByTime(30);
    expect(onDelta).toHaveBeenCalledTimes(1);
    expect(onDelta.mock.calls[0][0].content).toBe('abc');
  });
});
