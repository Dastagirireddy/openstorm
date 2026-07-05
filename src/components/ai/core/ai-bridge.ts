/**
 * Bridge: Syncs the existing AIStateManager singleton with the new AIStateStore.
 * This allows new ai-v2 components to consume the same state that the app already uses.
 */
import { aiState } from '../../lib/ai/ai-state.js';
import { aiStore, createDefaultState } from './ai-state.js';
import type { AIMessage, ToolCall, ToolApproval, SubAgent } from './ai-state.js';

export function initAIBridge(): void {
  // Sync sessions/messages
  aiState.on('message-added', ({ sessionId, message }: { sessionId: string; message: any }) => {
    if (sessionId !== aiState.activeSessionId) return;
    const msgs = aiStore.get('messages');
    const newMsg: AIMessage = {
      id: message.id || `msg-${Date.now()}`,
      role: message.role || 'user',
      content: message.content || '',
      timestamp: message.timestamp || Date.now(),
    };
    aiStore.set('messages', [...msgs, newMsg]);
  });

  aiState.on('message-updated', ({ sessionId, messageId, updates }: any) => {
    if (sessionId !== aiState.activeSessionId) return;
    const msgs = aiStore.get('messages').map(m =>
      m.id === messageId ? { ...m, ...updates } : m,
    );
    aiStore.set('messages', msgs);
  });

  aiState.on('session-switched', (_sessionId: string) => {
    syncMessagesFromSession();
  });

  aiState.on('session-cleared', (_sessionId: string) => {
    aiStore.set('messages', []);
    aiStore.set('streamingMessage', null);
  });

  aiState.on('session-created', (_session: any) => {
    syncMessagesFromSession();
  });

  // Sync streaming/thinking state
  aiState.on('thinking-status', (thinking: boolean) => {
    aiStore.set('isThinking', thinking);
  });

  aiState.on('streaming-status', (streaming: boolean) => {
    aiStore.set('isStreaming', streaming);
  });

  // Sync model selection
  aiState.on('model-selected', (model: { id: string; name: string; provider: string }) => {
    aiStore.set('currentModel', model.id);
  });

  aiState.on('provider-status', (connected: boolean) => {
    aiStore.set('agentId', connected ? 'connected' : null);
  });

  // Sync todos → subAgents
  aiState.on('todos-updated', (todos: any[]) => {
    const subAgents: SubAgent[] = todos.map(t => ({
      id: t.id,
      task: t.content,
      role: 'task',
      status: t.status as SubAgent['status'],
    }));
    aiStore.set('subAgents', subAgents);
  });

  // Sync cost/token updates
  aiState.on('cost-update', (data: { prompt_tokens: number; completion_tokens: number }) => {
    const total = (data.prompt_tokens || 0) + (data.completion_tokens || 0);
    aiStore.set('totalTokens', total);
  });

  // Initial sync
  aiStore.update({
    sessionId: aiState.activeSessionId || '',
    projectPath: '',
  });
  syncMessagesFromSession();
}

function syncMessagesFromSession(): void {
  const session = aiState.getActiveSession();
  if (!session) {
    aiStore.set('messages', []);
    return;
  }
  const messages: AIMessage[] = session.messages.map((m: any) => ({
    id: m.id || `msg-${Date.now()}`,
    role: m.role || 'user',
    content: m.content || '',
    timestamp: m.timestamp || Date.now(),
    toolCalls: m.toolCalls || undefined,
  }));
  aiStore.set('messages', messages);
  aiStore.set('sessionId', session.id);
}
