export interface StreamChunk {
  content: string;
  messageId: string;
  done: boolean;
}

export type StreamCallback = (chunk: StreamChunk) => void;

export interface StreamingControllerConfig {
  debounceMs?: number;
  onDelta: StreamCallback;
  onComplete: (messageId: string, totalContent: string) => void;
  onError: (error: string) => void;
}

export class StreamingController {
  private _buffer = '';
  private _messageId = '';
  private _debounceMs: number;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _active = false;
  private _onDelta: StreamCallback;
  private _onComplete: (messageId: string, totalContent: string) => void;
  private _onError: (error: string) => void;

  constructor(config: StreamingControllerConfig) {
    this._debounceMs = config.debounceMs ?? 16;
    this._onDelta = config.onDelta;
    this._onComplete = config.onComplete;
    this._onError = config.onError;
  }

  get active(): boolean {
    return this._active;
  }

  get buffer(): string {
    return this._buffer;
  }

  get messageId(): string {
    return this._messageId;
  }

  start(messageId: string): void {
    this._messageId = messageId;
    this._buffer = '';
    this._active = true;
  }

  append(content: string): void {
    if (!this._active) return;
    this._buffer += content;
    this._flushDebounced();
  }

  complete(): void {
    if (!this._active) return;
    this._flushImmediate();
    this._active = false;
    this._onComplete(this._messageId, this._buffer);
    this._cleanup();
  }

  error(message: string): void {
    this._active = false;
    this._onError(message);
    this._cleanup();
  }

  abort(): void {
    this._active = false;
    this._cleanup();
  }

  reset(): void {
    this._active = false;
    this._buffer = '';
    this._messageId = '';
    this._cleanup();
  }

  private _flushDebounced(): void {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      this._flushImmediate();
      this._timer = null;
    }, this._debounceMs);
  }

  private _flushImmediate(): void {
    if (!this._active || !this._buffer) return;
    this._onDelta({
      content: this._buffer,
      messageId: this._messageId,
      done: false,
    });
  }

  private _cleanup(): void {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }
}
