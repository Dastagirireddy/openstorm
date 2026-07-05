export type AIMessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'denied';
  result?: ToolResult;
}

export interface ToolResult {
  output: string;
  error?: string;
}

export interface ToolApproval {
  toolCallId: string;
  toolName: string;
  argsSummary: string;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface Question {
  id: string;
  text: string;
  options?: string[];
  multiSelect: boolean;
}

export interface SubAgent {
  id: string;
  task: string;
  role: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: string;
}

export interface PlanStep {
  step: number;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'done' | 'failed';
}

export interface MessageMetadata {
  model?: string;
  tokens?: number;
  latencyMs?: number;
  cost?: number;
}

export interface AIMessage {
  id: string;
  role: AIMessageRole;
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  metadata?: MessageMetadata;
  streaming?: boolean;
  isError?: boolean;
}

export interface UsageMetadata {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  latencyMs: number;
}

export interface AIState {
  sessionId: string;
  conversationId: string;
  messages: AIMessage[];
  streamingMessage: AIMessage | null;
  isStreaming: boolean;
  isThinking: boolean;
  currentModel: string;
  agentId: string | null;
  pendingApprovals: ToolApproval[];
  allowedTools: string[];
  activeToolCalls: ToolCall[];
  subAgents: SubAgent[];
  planSteps: PlanStep[];
  pendingQuestions: Question[];
  projectPath: string;
  attachedFiles: string[];
  ragContext: string | null;
  totalTokens: number;
  totalCost: number;
  lastLatencyMs: number;
}

export type AIStateKey = keyof AIState;

type Subscriber<T = unknown> = (value: T) => void;

export class AIStateStore {
  private _state: AIState;
  private _listeners: Map<AIStateKey, Set<Subscriber>> = new Map();

  constructor(initial: AIState) {
    this._state = { ...initial };
  }

  get state(): Readonly<AIState> {
    return this._state;
  }

  get<K extends AIStateKey>(key: K): AIState[K] {
    return this._state[key];
  }

  set<K extends AIStateKey>(key: K, value: AIState[K]): void {
    if (this._state[key] === value) return;
    this._state = { ...this._state, [key]: value };
    this._notify(key);
  }

  update(partial: Partial<AIState>): void {
    const changedKeys = Object.keys(partial) as AIStateKey[];
    let hasChanges = false;
    for (const key of changedKeys) {
      if (this._state[key] !== partial[key]) {
        hasChanges = true;
        break;
      }
    }
    if (!hasChanges) return;

    this._state = { ...this._state, ...partial };
    for (const key of changedKeys) {
      this._notify(key);
    }
  }

  subscribe<K extends AIStateKey>(key: K, callback: Subscriber<AIState[K]>): () => void {
    if (!this._listeners.has(key)) {
      this._listeners.set(key, new Set());
    }
    this._listeners.get(key)!.add(callback as Subscriber);
    return () => {
      this._listeners.get(key)?.delete(callback as Subscriber);
    };
  }

  private _notify(key: AIStateKey): void {
    const subs = this._listeners.get(key);
    if (subs) {
      for (const sub of subs) {
        sub(this._state[key]);
      }
    }
  }

  reset(): void {
    const keys = Object.keys(this._state) as AIStateKey[];
    this._state = createDefaultState();
    for (const key of keys) {
      this._notify(key);
    }
  }
}

export function createDefaultState(): AIState {
  return {
    sessionId: '',
    conversationId: '',
    messages: [],
    streamingMessage: null,
    isStreaming: false,
    isThinking: false,
    currentModel: '',
    agentId: null,
    pendingApprovals: [],
    allowedTools: [],
    activeToolCalls: [],
    subAgents: [],
    planSteps: [],
    pendingQuestions: [],
    projectPath: '',
    attachedFiles: [],
    ragContext: null,
    totalTokens: 0,
    totalCost: 0,
    lastLatencyMs: 0,
  };
}

export const DEFAULT_STATE = createDefaultState();

export const aiStore = new AIStateStore(DEFAULT_STATE);
