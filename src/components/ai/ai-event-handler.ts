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
  todos?: Array<{id: string, content: string, status: string, priority: string}>;
  preview?: string;
  file_path?: string;
  old_lines?: number;
  new_lines?: number;
  hunks?: any[];
  language?: string;
  command?: string;
  // Sub-agent events
  task_id?: string;
  description?: string;
  success?: boolean;
  tool_calls_made?: number;
  // Tool output streaming
  output_type?: string;
  data?: string;
  // Tool input required
  prompt?: string;
}

export interface EventHandlerContext {
  getMessages: () => ChatMessage[];
  addMessage: (sessionId: string, msg: ChatMessage) => void;
  updateMessage: (sessionId: string, msgId: string, update: Partial<ChatMessage>) => void;
  appendToOrCreateAssistant: (sessionId: string, content: string) => void;
  scrollToBottom: () => void;
  updateSessionStats: () => void;
  formatDuration: (seconds: number) => string;
  setPendingApproval: (approval: { toolName: string; preview: string; toolArgs: string } | null) => void;
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
      // Show sub-agent status messages in UI
      if (event.message && (event.message.includes('Sub-agent') || event.message.includes('sub-agent'))) {
        ctx.addMessage(sessionId, {
          id: `subagent-${Date.now()}`,
          role: 'thinking',
          content: event.message,
          timestamp: Date.now(),
        });
      }
      break;

    case 'tool_use':
      // Suppress internal tools from chat display
      if (event.tool_name === 'todo_write') break;
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
          toolCompleted: true,
        });
      }
      // Don't add tool_result message — raw file contents are noise in the chat
      break;
    }

    case 'tool_output': {
      // Find the most recent tool_use message for this tool_name
      const messages = ctx.getMessages();
      const toolMsg = [...messages].reverse().find(
        m => m.role === 'tool_use' && m.toolName === event.tool_name && !m.content.includes('Done')
      );
      if (toolMsg) {
        const existingOutput = toolMsg.streamingOutput || '';
        const newData = event.data || '';
        // Handle carriage return for progress updates (overwrite last line)
        let updatedOutput: string;
        if (newData.includes('\r') || (existingOutput.includes('\n') && newData === '')) {
          // Progress update: replace the last line or append
          const lines = existingOutput.split('\n');
          const cleanData = newData.replace(/\r/g, '').trim();
          if (lines.length > 0 && lines[lines.length - 1] !== '') {
            lines[lines.length - 1] = cleanData;
          } else {
            lines.push(cleanData);
          }
          updatedOutput = lines.join('\n');
        } else {
          updatedOutput = existingOutput + newData + '\n';
        }
        ctx.updateMessage(sessionId, toolMsg.id, {
          streamingOutput: updatedOutput,
          streamingOutputType: event.output_type || 'stdout',
        });
      }
      ctx.scrollToBottom();
      break;
    }

    case 'tool_input_required': {
      // Show a prompt for interactive input (sudo, password, etc.)
      ctx.addMessage(sessionId, {
        id: `input-req-${Date.now()}`,
        role: 'tool_approval',
        content: event.prompt || 'Input required',
        timestamp: Date.now(),
        toolName: event.tool_name,
        toolArgs: JSON.stringify({ type: 'input_required', prompt: event.prompt }),
      });
      ctx.scrollToBottom();
      break;
    }

    case 'tool_approval_required': {
      // Show as a bottom modal instead of inline chat message
      ctx.setPendingApproval({
        toolName: event.tool_name || '',
        preview: event.preview || '',
        toolArgs: event.arguments || '',
      });
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
      // Sub-agent completion - add as a new message
      if (event.content && (event.content.includes('Sub-agent completed') || event.content.includes('Sub-agent failed'))) {
        ctx.addMessage(sessionId, {
          id: `subagent-result-${Date.now()}`,
          role: 'assistant',
          content: event.content,
          timestamp: Date.now(),
          isStreaming: false,
        });
      } else {
        // Regular response - update existing or create new
        const msgs = ctx.getMessages();
        const lastAssistant = [...msgs].reverse().find(m => m.role === 'assistant');
        if (lastAssistant) {
          // Clean up: if the message is todo_write JSON or plan+todo_write JSON, remove it
          const content = lastAssistant.content || '';
          const trimmed = content.trim();
          const hasTodosObject = trimmed.includes('"todos"') && trimmed.includes('"id"');
          const isJustJson = trimmed.startsWith('{') && hasTodosObject;
          // Check for plan text + todo_write JSON pattern
          const hasPlanText = /^\d+\.\s/.test(trimmed) || trimmed.includes('TODOs');
          const hasJsonBlock = trimmed.includes('```json') || trimmed.includes('{\n');
          const isPlanWithTodos = hasPlanText && hasTodosObject;
          
          if (isJustJson || isPlanWithTodos) {
            // Remove the entire message - it's just tool output the model made as text
            ctx.updateMessage(sessionId, lastAssistant.id, { content: '', isStreaming: false });
          } else {
            ctx.updateMessage(sessionId, lastAssistant.id, { isStreaming: false });
          }
        } else if (event.content) {
          ctx.addMessage(sessionId, {
            id: `resp-${Date.now()}`,
            role: 'assistant',
            content: event.content,
            timestamp: Date.now(),
            isStreaming: false,
          });
        }
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

    case 'sub_task_spawned':
      ctx.addMessage(sessionId, {
        id: `subtask-${Date.now()}`,
        role: 'thinking',
        content: `Sub-agent spawned: ${event.description || 'Unknown task'}`,
        timestamp: Date.now(),
      });
      break;

    case 'sub_task_completed':
      ctx.addMessage(sessionId, {
        id: `subtask-done-${Date.now()}`,
        role: 'thinking',
        content: `Sub-agent completed: ${event.description || 'Task finished'}`,
        timestamp: Date.now(),
      });
      break;

    case 'todo_update':
      console.log('[AI] TodoUpdate received:', event.todos);
      aiState.setTodos(event.todos || []);
      break;
  }
}
