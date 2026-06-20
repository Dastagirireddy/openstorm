import type { ChatMessage, AISession } from '../../lib/types/ai-types.js';
import { aiState } from '../../lib/ai/ai-state.js';

export interface AgentEvent {
  type: string;
  content?: string;
  tool_name?: string;
  arguments?: string;
  result?: string;
  message?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  steps?: Array<{step: number, description: string, status: string}>;
  preview?: string;
  file_path?: string;
  old_lines?: number;
  new_lines?: number;
  hunks?: any[];
  language?: string;
  command?: string;
}

export interface EventHandlerContext {
  getMessages: () => ChatMessage[];
  addMessage: (sessionId: string, msg: ChatMessage) => void;
  updateMessage: (sessionId: string, msgId: string, update: Partial<ChatMessage>) => void;
  appendToOrCreateAssistant: (sessionId: string, content: string) => void;
  scrollToBottom: () => void;
  updateSessionStats: () => void;
  formatDuration: (seconds: number) => string;
}

export function handleAgentEvent(
  event: AgentEvent,
  sessionId: string,
  ctx: EventHandlerContext,
  state: {
    _iterationStartTime: number;
    responseStartTime: number;
    lastResponseTime: number;
    lastUsage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
  }
) {
  switch (event.type) {
    case 'thinking':
      state._iterationStartTime = Date.now();
      break;

    case 'tool_use':
      if (state._iterationStartTime) {
        const duration = (Date.now() - state._iterationStartTime) / 1000;
        ctx.addMessage(sessionId, {
          id: `thought-${Date.now()}`,
          role: 'thinking',
          content: ctx.formatDuration(duration),
          timestamp: Date.now(),
        });
        state._iterationStartTime = 0;
      }
      ctx.addMessage(sessionId, {
        id: `tool-${Date.now()}`,
        role: 'tool_use',
        content: `Using ${event.tool_name}...`,
        timestamp: Date.now(),
        toolName: event.tool_name,
        toolArgs: event.arguments,
      });
      break;

    case 'tool_result': {
      const messages = ctx.getMessages();
      const lastToolUse = [...messages].reverse().find(
        m => m.role === 'tool_use' && m.toolName === event.tool_name && !m.content.includes('Done')
      );
      if (lastToolUse) {
        ctx.updateMessage(sessionId, lastToolUse.id, {
          content: `Used ${event.tool_name} — Done`,
        });
      }
      // Don't add tool_result message — raw file contents are noise in the chat
      break;
    }

    case 'tool_approval_required': {
      ctx.addMessage(sessionId, {
        id: `approval-${Date.now()}`,
        role: 'tool_approval',
        content: event.preview,
        timestamp: Date.now(),
        toolName: event.tool_name,
        toolArgs: event.arguments,
      });
      break;
    }

    case 'plan_update': {
      const messages = ctx.getMessages();
      let planMsg = [...messages].reverse().find(m => m.role === 'plan');
      if (planMsg) {
        ctx.updateMessage(sessionId, planMsg.id, {
          content: JSON.stringify(event.steps),
        });
      } else {
        ctx.addMessage(sessionId, {
          id: `plan-${Date.now()}`,
          role: 'plan',
          content: JSON.stringify(event.steps),
          timestamp: Date.now(),
        });
      }
      break;
    }

    case 'text_delta':
      if (state._iterationStartTime) {
        const duration = (Date.now() - state._iterationStartTime) / 1000;
        ctx.addMessage(sessionId, {
          id: `thought-${Date.now()}`,
          role: 'thinking',
          content: ctx.formatDuration(duration),
          timestamp: Date.now(),
        });
        state._iterationStartTime = 0;
      }
      if (!state.responseStartTime) {
        state.responseStartTime = Date.now();
      }
      if (!aiState.isStreaming) {
        aiState.setStreaming(true);
      }
      ctx.appendToOrCreateAssistant(sessionId, event.content!);
      break;

    case 'response': {
      const msgs = ctx.getMessages();
      const lastAssistant = [...msgs].reverse().find(m => m.role === 'assistant');
      if (lastAssistant) {
        ctx.updateMessage(sessionId, lastAssistant.id, { isStreaming: false });
      } else if (event.content) {
        // No assistant message yet (e.g., forced final answer from loop detection)
        ctx.addMessage(sessionId, {
          id: `resp-${Date.now()}`,
          role: 'assistant',
          content: event.content,
          timestamp: Date.now(),
          isStreaming: false,
        });
      }
      if (state.responseStartTime) {
        state.lastResponseTime = (Date.now() - state.responseStartTime) / 1000;
        state.responseStartTime = 0;
      }
      if (event.usage) {
        state.lastUsage = event.usage;
      }
      aiState.setThinking(false);
      aiState.setStreaming(false);
      ctx.updateSessionStats();
      break;
    }

    case 'error':
      ctx.addMessage(sessionId, {
        id: `err-${Date.now()}`,
        role: 'error',
        content: event.message,
        timestamp: Date.now(),
      });
      aiState.setThinking(false);
      aiState.setStreaming(false);
      break;
  }
}
