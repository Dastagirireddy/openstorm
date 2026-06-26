import type { AiTimeline, TimelineStepData, SummaryData } from './ai-timeline.js';
import type { TelemetryField } from './ai-timeline-step.js';
import type { FileModification, CostSnapshot } from './ai-execution-summary.js';
import { aiState } from '../../../lib/ai/ai-state.js';

interface AgentEvent {
  type: string;
  [key: string]: unknown;
}

interface EventHandlerContext {
  timeline: AiTimeline;
  stepCounter: number;
  steps: Map<string, TimelineStepData>;
  streamingInitialized: boolean;
}

export function createTimelineEventHandler(timeline: AiTimeline) {
  const ctx: EventHandlerContext = {
    timeline,
    stepCounter: 0,
    steps: new Map(),
    streamingInitialized: false,
  };

  function resetContext() {
    ctx.stepCounter = 0;
    ctx.steps.clear();
    ctx.streamingInitialized = false;
  }

  function handleAgentEvent(event: AgentEvent) {
    switch (event.type) {
      case 'thinking':
        handleThinking(ctx, event);
        break;
      case 'tool_use':
        handleToolUse(ctx, event);
        break;
      case 'tool_result':
        handleToolResult(ctx, event);
        break;
      case 'tool_telemetry':
        handleToolTelemetry(ctx, event);
        break;
      case 'tool_approval_required':
        handlePermissionRequired(ctx, event);
        break;
      case 'text_delta':
        handleTextDelta(ctx, event);
        break;
      case 'response':
        handleResponse(ctx, event);
        break;
      case 'error':
        handleError(ctx, event);
        break;
      case 'todo_update':
        aiState.setTodos(event.todos as Array<{id: string; content: string; status: string; priority: string}>);
        break;
      case 'plan_update':
        break;
      case 'cost_update':
        break;
      case 'execution_summary':
        handleExecutionSummary(ctx, event);
        break;
    }
  }

  return { handleAgentEvent, resetContext };
}

function handleThinking(ctx: EventHandlerContext, _event: AgentEvent) {
  aiState.setThinking(true);
  // Reset streaming state for new request
  ctx.streamingInitialized = false;
}

// Tools that should be filtered from the timeline (handled by task sidebar)
const HIDDEN_TOOLS = new Set(['todo_write']);

function handleToolUse(ctx: EventHandlerContext, event: AgentEvent) {
  const toolName = (event.tool_name as string) || 'unknown';

  // Filter internal tools that clutter the timeline
  if (HIDDEN_TOOLS.has(toolName)) {
    return;
  }

  const args = (event.arguments as string) || '{}';

  ctx.stepCounter++;
  const stepId = `step-${ctx.stepCounter}`;

  const { name, description } = getToolDisplayInfo(toolName, args);

  const step: TimelineStepData = {
    id: stepId,
    name: name || toolName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: description || '',
    toolBadge: toolName,
    status: 'active',
    telemetryFields: [],
  };

  ctx.steps.set(stepId, step);

  // Mark previous active steps as completed
  for (const [id, s] of ctx.steps) {
    if (id !== stepId && s.status === 'active') {
      ctx.steps.set(id, { ...s, status: 'completed' });
      ctx.timeline.updateStep(id, { status: 'completed' });
    }
  }

  ctx.timeline.addStep(step);
}

function handleToolResult(ctx: EventHandlerContext, event: AgentEvent) {
  const toolName = event.tool_name as string;
  const result = event.result as string;

  for (const [id, step] of ctx.steps) {
    if (step.toolBadge === toolName && step.status === 'active') {
      const hasError = result.startsWith('Error') || result.startsWith('Unknown tool');
      const newStatus = hasError ? 'failed' : 'completed';
      ctx.steps.set(id, { ...step, status: newStatus });
      ctx.timeline.updateStep(id, { status: newStatus });
      break;
    }
  }
}

function handleToolTelemetry(ctx: EventHandlerContext, event: AgentEvent) {
  const toolName = event.tool_name as string;
  const fields = event.fields as TelemetryField[];

  for (const [id, step] of ctx.steps) {
    if (step.toolBadge === toolName) {
      ctx.timeline.updateStepTelemetry(id, fields);
      break;
    }
  }
}

function handlePermissionRequired(ctx: EventHandlerContext, event: AgentEvent) {
  const toolName = event.tool_name as string;
  const args = event.arguments as string;
  const preview = event.preview as string;

  let reason = `Delete the directory '${extractPath(args)}' recursively.`;
  let command = '';

  try {
    const parsed = JSON.parse(preview);
    if (parsed.type === 'command') {
      command = parsed.command || '';
      reason = `Run command: ${command}`;
    } else if (parsed.type === 'diff') {
      const path = parsed.file_path || 'unknown';
      command = `Write to ${path}`;
      reason = `Modify file: ${path}`;
    } else if (parsed.type === 'edit') {
      const path = parsed.file_path || 'unknown';
      command = `Edit ${path} (lines ${parsed.start_line || '?'}-${parsed.end_line || '?'})`;
      reason = `Edit file: ${path}`;
    }
  } catch {
    command = preview;
  }

  ctx.timeline.showPermission({
    toolName: toolName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    reason,
    command,
  });
}

function handleTextDelta(ctx: EventHandlerContext, event: AgentEvent) {
  // Only update streaming state once at the start
  if (!ctx.streamingInitialized) {
    aiState.setThinking(false);
    aiState.setStreaming(true);
    ctx.streamingInitialized = true;
  }
  const content = event.content as string;
  ctx.timeline.appendResponseText(content);
}

function handleResponse(ctx: EventHandlerContext, event: AgentEvent) {
  const content = event.content as string;
  // Don't replace responseText here — TextDelta events already accumulated it.
  // The Response event's content may be stale in multi-turn loops (only last turn's text).

  // Store assistant response in session history (use accumulated text, not stale content)
  const sessionId = aiState.activeSessionId;
  const finalText = ctx.timeline.responseText || content;
  if (sessionId && finalText) {
    aiState.addMessage(sessionId, {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: finalText,
      timestamp: Date.now(),
    });
  }

  // Mark all remaining active steps as completed
  for (const [id, step] of ctx.steps) {
    if (step.status === 'active') {
      ctx.timeline.updateStep(id, { status: 'completed' });
    }
  }

  // Streaming is complete
  aiState.setThinking(false);
  aiState.setStreaming(false);
}

function handleError(ctx: EventHandlerContext, event: AgentEvent) {
  const message = event.message as string;
  ctx.timeline.setResponseText(`Error: ${message}`);

  for (const [id, step] of ctx.steps) {
    if (step.status === 'active') {
      ctx.timeline.updateStep(id, { status: 'failed' });
    }
  }

  // Streaming is complete (with error)
  aiState.setThinking(false);
  aiState.setStreaming(false);
}

function handleExecutionSummary(ctx: EventHandlerContext, event: AgentEvent) {
  const summary: SummaryData = {
    status: (event.status as string) || 'completed',
    filesModified: (event.files_modified as FileModification[]) || [],
    totalToolCalls: (event.total_tool_calls as number) || 0,
    durationMs: (event.duration_ms as number) || 0,
    costSummary: (event.cost_summary as CostSnapshot) || null,
  };
  ctx.timeline.showSummary(summary);
}

function extractPath(args: string): string {
  try {
    const parsed = JSON.parse(args);
    return parsed.path || parsed.directory || 'unknown';
  } catch {
    return 'unknown';
  }
}

function getToolDisplayInfo(toolName: string, args: string): { name: string; description: string } {
  let parsed: Record<string, unknown> = {};
  try { 
    parsed = JSON.parse(args); 
  } catch { 
    parsed = {}; 
  }

  const path = (parsed.path as string) || '';
  const command = (parsed.command as string) || '';
  const pattern = (parsed.pattern as string) || '';
  const pid = (parsed.pid as number) || 0;
  const url = (parsed.url as string) || '';

  switch (toolName) {
    case 'read_file':
      return { 
        name: `Read ${path || 'file'}`, 
        description: `Reading ${path || 'file'}` 
      };
    case 'write_file':
      return { 
        name: `Write ${path || 'file'}`, 
        description: `Writing changes to ${path || 'file'}` 
      };
    case 'edit_file':
      return { 
        name: `Edit ${path || 'file'}`, 
        description: `Editing ${path || 'file'}` 
      };
    case 'run_command':
      return {
        name: `Run: ${command.substring(0, 50)}${command.length > 50 ? '...' : ''}`,
        description: command,
      };
    case 'run_background':
      return {
        name: `Started app in background`,
        description: command,
      };
    case 'read_process_output':
      return {
        name: `Verify app started`,
        description: pid ? `Checking process ${pid}` : 'Checking output',
      };
    case 'stop_process':
      return { 
        name: `Stop process`, 
        description: pid ? `PID ${pid}` : '' 
      };
    case 'search_code':
      return { 
        name: `Search: "${pattern}"`, 
        description: `Searching codebase` 
      };
    case 'list_directory':
      return { 
        name: `List ${path || 'directory'}`, 
        description: `Listing contents` 
      };
    case 'git_status':
      return { 
        name: 'Git status', 
        description: 'Checking repository status' 
      };
    case 'git_diff':
      return { 
        name: 'Git diff', 
        description: 'Showing changes' 
      };
    case 'todo_write':
      return { 
        name: 'Update task list', 
        description: 'Updating plan progress' 
      };
    case 'webfetch':
      return { 
        name: `Fetch URL`, 
        description: url || (parsed.url as string) || '' 
      };
    default:
      return {
        name: toolName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        description: '',
      };
  }
}
