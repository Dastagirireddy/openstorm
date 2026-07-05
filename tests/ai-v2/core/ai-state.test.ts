import { describe, it, expect } from 'vitest';
import {
  AIStateStore,
  createDefaultState,
  DEFAULT_STATE,
} from '../../../src/components/ai-v2/core/ai-state.js';

describe('createDefaultState', () => {
  it('returns a valid default state', () => {
    const state = createDefaultState();
    expect(state.sessionId).toBe('');
    expect(state.messages).toEqual([]);
    expect(state.streamingMessage).toBeNull();
    expect(state.isStreaming).toBe(false);
    expect(state.isThinking).toBe(false);
    expect(state.currentModel).toBe('');
    expect(state.agentId).toBeNull();
    expect(state.pendingApprovals).toEqual([]);
    expect(state.activeToolCalls).toEqual([]);
    expect(state.subAgents).toEqual([]);
    expect(state.pendingQuestions).toEqual([]);
    expect(state.projectPath).toBe('');
    expect(state.attachedFiles).toEqual([]);
    expect(state.ragContext).toBeNull();
    expect(state.totalTokens).toBe(0);
    expect(state.totalCost).toBe(0);
    expect(state.lastLatencyMs).toBe(0);
  });

  it('DEFAULT_STATE has correct default values', () => {
    expect(DEFAULT_STATE.sessionId).toBe('');
    expect(DEFAULT_STATE.messages).toEqual([]);
    expect(DEFAULT_STATE.isStreaming).toBe(false);
  });
});

describe('AIStateStore', () => {
  it('initializes with default state', () => {
    const store = new AIStateStore(createDefaultState());
    expect(store.state.isStreaming).toBe(false);
    expect(store.state.messages).toEqual([]);
  });

  it('get returns value by key', () => {
    const store = new AIStateStore({ ...createDefaultState(), totalTokens: 42 });
    expect(store.get('totalTokens')).toBe(42);
  });

  it('set updates value and notifies subscribers', () => {
    const store = new AIStateStore(createDefaultState());
    const callback = vi.fn();
    store.subscribe('isStreaming', callback);

    store.set('isStreaming', true);
    expect(store.get('isStreaming')).toBe(true);
    expect(callback).toHaveBeenCalledWith(true);
  });

  it('set does not notify when value unchanged', () => {
    const store = new AIStateStore(createDefaultState());
    const callback = vi.fn();
    store.subscribe('isStreaming', callback);

    store.set('isStreaming', false);
    expect(callback).not.toHaveBeenCalled();
  });

  it('update applies multiple changes and notifies each', () => {
    const store = new AIStateStore(createDefaultState());
    const streamingCb = vi.fn();
    const tokensCb = vi.fn();
    store.subscribe('isStreaming', streamingCb);
    store.subscribe('totalTokens', tokensCb);

    store.update({ isStreaming: true, totalTokens: 100 });
    expect(store.get('isStreaming')).toBe(true);
    expect(store.get('totalTokens')).toBe(100);
    expect(streamingCb).toHaveBeenCalledOnce();
    expect(tokensCb).toHaveBeenCalledOnce();
  });

  it('update does not notify when no changes', () => {
    const store = new AIStateStore(createDefaultState());
    const callback = vi.fn();
    store.subscribe('isStreaming', callback);

    store.update({ isStreaming: false });
    expect(callback).not.toHaveBeenCalled();
  });

  it('unsubscribe stops notifications', () => {
    const store = new AIStateStore(createDefaultState());
    const callback = vi.fn();
    const unsub = store.subscribe('totalTokens', callback);

    store.set('totalTokens', 10);
    expect(callback).toHaveBeenCalledOnce();

    unsub();
    store.set('totalTokens', 20);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('reset returns to default and notifies all keys', () => {
    const store = new AIStateStore(createDefaultState());
    store.set('isStreaming', true);
    store.set('totalTokens', 999);

    const callbacks = {
      isStreaming: vi.fn(),
      totalTokens: vi.fn(),
      messages: vi.fn(),
    };
    store.subscribe('isStreaming', callbacks.isStreaming);
    store.subscribe('totalTokens', callbacks.totalTokens);
    store.subscribe('messages', callbacks.messages);

    store.reset();

    expect(store.get('isStreaming')).toBe(false);
    expect(store.get('totalTokens')).toBe(0);
    expect(store.get('messages')).toEqual([]);
    expect(callbacks.isStreaming).toHaveBeenCalled();
    expect(callbacks.totalTokens).toHaveBeenCalled();
    expect(callbacks.messages).toHaveBeenCalled();
  });

  it('supports multiple subscribers on same key', () => {
    const store = new AIStateStore(createDefaultState());
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    store.subscribe('currentModel', cb1);
    store.subscribe('currentModel', cb2);

    store.set('currentModel', 'gpt-4o');
    expect(cb1).toHaveBeenCalledWith('gpt-4o');
    expect(cb2).toHaveBeenCalledWith('gpt-4o');
  });

  it('different keys notify independently', () => {
    const store = new AIStateStore(createDefaultState());
    const streamingCb = vi.fn();
    const modelCb = vi.fn();
    store.subscribe('isStreaming', streamingCb);
    store.subscribe('currentModel', modelCb);

    store.set('isStreaming', true);
    expect(streamingCb).toHaveBeenCalledOnce();
    expect(modelCb).not.toHaveBeenCalled();
  });
});
