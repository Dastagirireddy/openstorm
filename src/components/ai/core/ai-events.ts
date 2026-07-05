import type { AIMessage, ToolCall, ToolApproval, Question, UsageMetadata, PlanStep } from './ai-state.js';

export interface SendMessageDetail {
  message: string;
  originalText?: string;
  attachments: string[];
}

export interface CancelDetail {}

export interface ApproveToolDetail {
  toolCallId: string;
  approved: boolean;
}

export interface AnswerQuestionDetail {
  questionId: string;
  answers: Record<string, string | string[]>;
}

export interface SelectModelDetail {
  model: string;
}

export interface SpawnAgentDetail {
  task: string;
  role: string;
}

export interface TextDeltaDetail {
  content: string;
  messageId: string;
}

export interface MessageCompleteDetail {
  message: AIMessage;
}

export interface ToolStartDetail {
  toolCall: ToolCall;
}

export interface ToolCompleteDetail {
  toolCall: ToolCall;
  result: { output: string; error?: string };
}

export interface PermissionRequestDetail {
  approval: ToolApproval;
}

export interface PermissionResolvedDetail {
  toolCallId: string;
  approved: boolean;
}

export interface QuestionAskedDetail {
  question: Question;
}

export interface StreamStartDetail {
  messageId: string;
}

export interface StreamEndDetail {
  messageId: string;
  usage: UsageMetadata;
}

export interface SubagentProgressDetail {
  task: string;
  status: string;
}

export interface ErrorDetail {
  message: string;
  code?: string;
}

export interface PlanUpdateDetail {
  steps: PlanStep[];
}

export type AIEventType =
  | 'ai:send-message'
  | 'ai:cancel'
  | 'ai:approve-tool'
  | 'ai:answer-question'
  | 'ai:select-model'
  | 'ai:spawn-agent'
  | 'ai:text-delta'
  | 'ai:message-complete'
  | 'ai:tool-start'
  | 'ai:tool-complete'
  | 'ai:permission-request'
  | 'ai:permission-resolved'
  | 'ai:question-asked'
  | 'ai:stream-start'
  | 'ai:stream-end'
  | 'ai:subagent-progress'
  | 'ai:plan-update'
  | 'ai:error';

export type AIEventDetailMap = {
  'ai:send-message': SendMessageDetail;
  'ai:cancel': CancelDetail;
  'ai:approve-tool': ApproveToolDetail;
  'ai:answer-question': AnswerQuestionDetail;
  'ai:select-model': SelectModelDetail;
  'ai:spawn-agent': SpawnAgentDetail;
  'ai:text-delta': TextDeltaDetail;
  'ai:message-complete': MessageCompleteDetail;
  'ai:tool-start': ToolStartDetail;
  'ai:tool-complete': ToolCompleteDetail;
  'ai:permission-request': PermissionRequestDetail;
  'ai:permission-resolved': PermissionResolvedDetail;
  'ai:question-asked': QuestionAskedDetail;
  'ai:stream-start': StreamStartDetail;
  'ai:stream-end': StreamEndDetail;
  'ai:subagent-progress': SubagentProgressDetail;
  'ai:plan-update': PlanUpdateDetail;
  'ai:error': ErrorDetail;
};

export function dispatchAIEvent<K extends AIEventType>(
  target: EventTarget,
  type: K,
  detail: AIEventDetailMap[K],
): boolean {
  return target.dispatchEvent(
    new CustomEvent(type, {
      detail,
      bubbles: true,
      composed: true,
    }),
  );
}

export function listenAIEvent<K extends AIEventType>(
  target: EventTarget,
  type: K,
  handler: (detail: AIEventDetailMap[K]) => void,
): () => void {
  const listener = ((e: CustomEvent<AIEventDetailMap[K]>) => {
    handler(e.detail);
  }) as EventListener;
  target.addEventListener(type, listener);
  return () => target.removeEventListener(type, listener);
}
