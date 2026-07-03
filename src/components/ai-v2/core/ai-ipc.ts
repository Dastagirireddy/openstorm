import type { AIMessage } from './ai-state.js';
import type {
  TextDeltaDetail,
  ToolStartDetail,
  ToolCompleteDetail,
  PermissionRequestDetail,
  QuestionAskedDetail,
  ErrorDetail,
  SubagentProgressDetail,
} from './ai-events.js';

export interface ChatRequest {
  message: string;
  history: Array<{ role: string; content: string }>;
  project_path: string;
  model: string;
}

export interface ApproveToolRequest {
  tool_call_id: string;
  approved: boolean;
}

export interface SpawnAgentRequest {
  task: string;
  role: string;
  parent_id: string | null;
}

export interface QuestionResponseRequest {
  answers: Record<string, string | string[]>;
}

export interface IPCInvoke {
  (cmd: string, args?: Record<string, unknown>): Promise<unknown>;
}

export interface IPCListen {
  (event: string, handler: (payload: { payload: unknown }) => void): Promise<() => void>;
}

export type AgentEventType =
  | { type: 'text-delta'; content: string; messageId: string }
  | { type: 'tool-use'; toolCall: ToolStartDetail['toolCall'] }
  | { type: 'tool-result'; toolCall: ToolCompleteDetail['toolCall']; result: ToolCompleteDetail['result'] }
  | { type: 'permission-request'; approval: PermissionRequestDetail['approval'] }
  | { type: 'question-request'; questions: QuestionAskedDetail['question'][] }
  | { type: 'error'; message: string; code?: string }
  | { type: 'stream-start'; messageId: string }
  | { type: 'stream-end'; messageId: string; usage: unknown }
  | { type: 'subagent-progress'; task: string; status: string }
  | { type: 'plan-update'; steps: Array<{ step: number; description: string; status: string }> };

export type AgentEventHandler = (event: AgentEventType) => void;

export function createAIClient(invoke: IPCInvoke, listen: IPCListen) {
  return {
    sendMessage: (
      msg: string,
      history: Array<{ role: string; content: string }>,
      project: string,
      model: string,
    ) =>
      invoke('ai_v2_chat', {
        request: { message: msg, history, project_path: project, model },
      }),

    approveTool: (toolCallId: string, approved: boolean) =>
      invoke('ai_v2_approve_tool', {
        request: { tool_call_id: toolCallId, approved } as ApproveToolRequest,
      }),

    abort: () => invoke('ai_v2_abort'),

    spawnAgent: (task: string, role: string) =>
      invoke('ai_v2_spawn_agent', {
        request: { task, role, parent_id: null } as SpawnAgentRequest,
      }),

    answerQuestion: (answers: Record<string, string | string[]>) =>
      invoke('ai_v2_question_response', {
        request: { answers } as QuestionResponseRequest,
      }),

    listenToAgentEvents: (handler: AgentEventHandler): (() => void) => {
      const unsubscribers: (() => void)[] = [];

      const setup = async () => {
        const unlisten1 = await listen('ai-v2:text-delta', (e) =>
          handler({ type: 'text-delta', ...(e.payload as object) } as AgentEventType),
        );
        const unlisten2 = await listen('ai-v2:tool-use', (e) =>
          handler({ type: 'tool-use', toolCall: (e.payload as { toolCall: unknown }).toolCall } as AgentEventType),
        );
        const unlisten3 = await listen('ai-v2:tool-result', (e) =>
          handler({ type: 'tool-result', ...(e.payload as object) } as AgentEventType),
        );
        const unlisten4 = await listen('ai-v2:tool-approval-required', (e) =>
          handler({ type: 'permission-request', approval: (e.payload as { approval: unknown }).approval } as AgentEventType),
        );
        const unlisten5 = await listen('ai-v2:question-request', (e) =>
          handler({ type: 'question-request', questions: (e.payload as { questions: unknown }).questions } as AgentEventType),
        );
        const unlisten6 = await listen('ai-v2:error', (e) =>
          handler({ type: 'error', ...(e.payload as object) } as AgentEventType),
        );
        const unlisten7 = await listen('ai-v2:plan-update', (e) =>
          handler({ type: 'plan-update', steps: (e.payload as { steps: unknown[] })?.steps || [] } as AgentEventType),
        );
        unsubscribers.push(unlisten1, unlisten2, unlisten3, unlisten4, unlisten5, unlisten6, unlisten7);
      };

      setup();

      return () => {
        for (const unsub of unsubscribers) unsub();
      };
    },
  };
}
