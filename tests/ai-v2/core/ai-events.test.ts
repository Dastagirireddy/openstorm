import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  dispatchAIEvent,
  listenAIEvent,
} from '../../../src/components/ai-v2/core/ai-events.js';

describe('dispatchAIEvent', () => {
  let target: EventTarget;

  beforeEach(() => {
    target = new EventTarget();
  });

  it('dispatches a CustomEvent with correct type and detail', () => {
    const handler = vi.fn();
    target.addEventListener('ai:send-message', handler);

    dispatchAIEvent(target, 'ai:send-message', {
      message: 'hello',
      attachments: [],
    });

    expect(handler).toHaveBeenCalledOnce();
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe('ai:send-message');
    expect(event.detail).toEqual({ message: 'hello', attachments: [] });
  });

  it('event bubbles and is composed', () => {
    let received = false;
    const child = new EventTarget();
    const parent = new EventTarget();

    child.addEventListener('ai:cancel', () => { received = true; });

    // bubbling/composed requires DOM elements; in jsdom this works
    const childEl = document.createElement('div');
    const parentEl = document.createElement('div');
    parentEl.appendChild(childEl);

    parentEl.addEventListener('ai:cancel', () => { received = true; });

    dispatchAIEvent(childEl, 'ai:cancel', {});
    expect(received).toBe(true);
  });

  it('dispatches all event types without error', () => {
    const types = [
      'ai:send-message',
      'ai:cancel',
      'ai:approve-tool',
      'ai:answer-question',
      'ai:select-model',
      'ai:spawn-agent',
      'ai:text-delta',
      'ai:message-complete',
      'ai:tool-start',
      'ai:tool-complete',
      'ai:permission-request',
      'ai:permission-resolved',
      'ai:question-asked',
      'ai:stream-start',
      'ai:stream-end',
      'ai:subagent-progress',
      'ai:error',
    ] as const;

    for (const type of types) {
      const cb = vi.fn();
      target.addEventListener(type, cb);
      dispatchAIEvent(target, type, {} as any);
      expect(cb).toHaveBeenCalledOnce();
      target.removeEventListener(type, cb);
    }
  });
});

describe('listenAIEvent', () => {
  let target: EventTarget;

  beforeEach(() => {
    target = new EventTarget();
  });

  it('calls handler when event fires', () => {
    const handler = vi.fn();
    listenAIEvent(target, 'ai:text-delta', handler);

    dispatchAIEvent(target, 'ai:text-delta', { content: 'hi', messageId: '1' });
    expect(handler).toHaveBeenCalledWith({ content: 'hi', messageId: '1' });
  });

  it('unsubscribe stops listening', () => {
    const handler = vi.fn();
    const unsub = listenAIEvent(target, 'ai:text-delta', handler);

    dispatchAIEvent(target, 'ai:text-delta', { content: 'a', messageId: '1' });
    expect(handler).toHaveBeenCalledOnce();

    unsub();
    dispatchAIEvent(target, 'ai:text-delta', { content: 'b', messageId: '2' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('supports multiple listeners on same event', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    listenAIEvent(target, 'ai:error', cb1);
    listenAIEvent(target, 'ai:error', cb2);

    dispatchAIEvent(target, 'ai:error', { message: 'fail' });
    expect(cb1).toHaveBeenCalledOnce();
    expect(cb2).toHaveBeenCalledOnce();
  });
});
