export interface AISession {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface AIAttachment {
  id: string;
  path: string;
  name: string;
  content?: string;
  type: 'file' | 'folder';
  lineCount?: number;
  byteCount?: number;
}

export interface TokenUsage {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'tool_approval' | 'plan' | 'thinking' | 'error' | 'system';
  content: string;
  timestamp: number;
  attachments?: AIAttachment[];
  toolName?: string;
  toolArgs?: string;
  decision?: 'approved' | 'denied';
  isStreaming?: boolean;
  tokens?: TokenUsage;
  cost?: number;
  model?: string;
  duration?: number;
  // Streaming tool output (for run_command etc.)
  streamingOutput?: string;
  streamingOutputType?: string;
  toolCompleted?: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  context_window: number;
  max_output: number;
  supports_tools: boolean;
  supports_vision?: boolean;
  is_free?: boolean;
}

export interface ProviderInfo {
  id: string;
  name: string;
  is_free: boolean;
  requires_api_key: boolean;
}

export interface AiProviderConfig {
  provider: string;
  api_key: string;
  base_url: string;
  model: string;
}

export interface AIState {
  sessions: AISession[];
  activeSessionId: string | null;
  models: ModelInfo[];
  selectedModel: string;
  ollamaConnected: boolean;
  isThinking: boolean;
  isStreaming: boolean;
}

export type AISessionEvent =
  | { type: 'session_created'; session: AISession }
  | { type: 'session_deleted'; sessionId: string }
  | { type: 'session_switched'; sessionId: string }
  | { type: 'session_renamed'; sessionId: string; name: string }
  | { type: 'message_added'; sessionId: string; message: ChatMessage }
  | { type: 'message_updated'; sessionId: string; messageId: string; updates: Partial<ChatMessage> };

// ── MCP Types ──────────────────────────────────────────────

export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
}

export interface McpServerStatus {
  name: string;
  connected: boolean;
  tool_count: number;
  error: string | null;
}

export interface McpToolInfo {
  server_name: string;
  original_name: string;
  namespaced_name: string;
  description: string;
}
