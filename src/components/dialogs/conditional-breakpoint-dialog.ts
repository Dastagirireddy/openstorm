import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { TailwindElement } from "../../tailwind-element.js";

export interface BreakpointCondition {
  condition?: string;
  hitCondition?: string;
  hitConditionOp?: "==" | ">=" | "<=" | "%";
  logMessage?: string;
}

@customElement("conditional-breakpoint-dialog")
export class ConditionalBreakpointDialog extends TailwindElement() {
  @state() private visible = false;
  @state() private condition = "";
  @state() private hitCondition = "";
  @state() private hitConditionOp: "==" | ">=" | "<=" | "%" = "==";
  @state() private logMessage = "";
  @state() private breakpointType: "condition" | "hit" | "log" = "condition";

  private resolve?: (value: BreakpointCondition | null) => void;

  static styles = css`
    :host {
      display: none;
    }

    :host([visible]) {
      display: block;
    }

    .overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .dialog {
      background: #ffffff;
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.16);
      min-width: 420px;
      max-width: 500px;
      overflow: hidden;
    }

    .dialog-header {
      padding: 16px 20px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .dialog-title {
      font-size: 14px;
      font-weight: 600;
      color: #1a1a1a;
    }

    .close-button {
      width: 28px;
      height: 28px;
      border: none;
      background: transparent;
      cursor: pointer;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #666;
    }

    .close-button:hover {
      background: #f3f4f6;
    }

    .dialog-content {
      padding: 20px;
    }

    .tab-list {
      display: flex;
      gap: 4px;
      margin-bottom: 16px;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 0;
    }

    .tab {
      padding: 8px 12px;
      font-size: 13px;
      border: none;
      background: transparent;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      color: #666;
      transition: all 0.15s;
    }

    .tab:hover {
      color: #1a1a1a;
      background: #f9fafb;
    }

    .tab.active {
      color: #0078d4;
      border-bottom-color: #0078d4;
      background: #f0f7ff;
    }

    .input-group {
      margin-bottom: 16px;
    }

    .input-label {
      display: block;
      font-size: 12px;
      font-weight: 500;
      color: #374151;
      margin-bottom: 6px;
    }

    .input-field {
      width: 100%;
      padding: 8px 12px;
      font-size: 13px;
      font-family: 'Fira Code', 'JetBrains Mono', monospace;
      border: 1px solid #d0d0d0;
      border-radius: 4px;
      background: #ffffff;
      color: #1a1a1a;
      transition: all 0.15s;
    }

    .input-field:focus {
      outline: none;
      border-color: var(--brand-primary);
      box-shadow: 0 0 0 3px rgba(91, 71, 201, 0.15);
    }

    .input-field::placeholder {
      color: #9ca3af;
    }

    .hit-condition-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .hit-condition-select {
      width: 70px;
      padding: 8px 6px;
      font-size: 13px;
      border: 1px solid #d0d0d0;
      border-radius: 4px;
      background: #ffffff;
      cursor: pointer;
    }

    .hit-condition-select:focus {
      outline: none;
      border-color: var(--brand-primary);
    }

    .help-text {
      font-size: 11px;
      color: #6b7280;
      margin-top: 6px;
      line-height: 1.4;
    }

    .help-code {
      background: #f3f4f6;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Fira Code', 'JetBrains Mono', monospace;
      font-size: 10px;
      color: #c41e3a;
    }

    .dialog-footer {
      padding: 12px 20px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      background: #f9fafb;
    }

    .button {
      padding: 8px 16px;
      font-size: 13px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .button.secondary {
      background: #e5e7eb;
      color: #374151;
    }

    .button.secondary:hover {
      background: #d1d5db;
    }

    .button.primary {
      background: var(--brand-primary);
      color: #ffffff;
    }

    .button.primary:hover {
      background: var(--brand-primary-hover);
    }

    .button.remove {
      background: #fee2e2;
      color: #dc2626;
    }

    .button.remove:hover {
      background: #fecaca;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("keydown", this.handleKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("keydown", this.handleKeyDown);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this.visible) {
      this.close();
    }
  };

  async show(breakpointType: "condition" | "hit" | "log" = "condition"): Promise<BreakpointCondition | null> {
    this.breakpointType = breakpointType;
    this.condition = "";
    this.hitCondition = "";
    this.hitConditionOp = "==";
    this.logMessage = "";
    this.visible = true;

    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  private close() {
    this.visible = false;
    if (this.resolve) {
      this.resolve(null);
      this.resolve = undefined;
    }
  }

  private apply() {
    const result: BreakpointCondition = {};

    if (this.breakpointType === "condition" && this.condition.trim()) {
      result.condition = this.condition.trim();
    } else if (this.breakpointType === "hit" && this.hitCondition.trim()) {
      result.hitCondition = `${this.hitConditionOp}${this.hitCondition.trim()}`;
    } else if (this.breakpointType === "log" && this.logMessage.trim()) {
      result.logMessage = this.logMessage.trim();
    }

    this.visible = false;
    if (this.resolve) {
      this.resolve(Object.keys(result).length > 0 ? result : null);
      this.resolve = undefined;
    }
  }

  private remove() {
    this.visible = false;
    if (this.resolve) {
      this.resolve(null);
      this.resolve = undefined;
    }
  }

  override render() {
    if (!this.visible) return html``;

    return html`
      <div class="overlay" @click=${() => this.close()}>
        <div class="dialog" @click=${(e: Event) => e.stopPropagation()}>
          <div class="dialog-header">
            <span class="dialog-title">Edit Breakpoint</span>
            <button class="close-button" @click=${() => this.close()}>
              <iconify-icon icon="mdi:close" width="16"></iconify-icon>
            </button>
          </div>

          <div class="dialog-content">
            <div class="tab-list">
              <button
                class="tab ${this.breakpointType === "condition" ? "active" : ""}"
                @click=${() => { this.breakpointType = "condition"; this.requestUpdate(); }}>
                Expression
              </button>
              <button
                class="tab ${this.breakpointType === "hit" ? "active" : ""}"
                @click=${() => { this.breakpointType = "hit"; this.requestUpdate(); }}>
                Hit Count
              </button>
              <button
                class="tab ${this.breakpointType === "log" ? "active" : ""}"
                @click=${() => { this.breakpointType = "log"; this.requestUpdate(); }}>
                Log Message
              </button>
            </div>

            ${this.breakpointType === "condition" ? html`
              <div class="input-group">
                <label class="input-label">Condition</label>
                <input
                  type="text"
                  class="input-field"
                  placeholder="e.g., count > 5"
                  .value=${this.condition}
                  @input=${(e: Event) => { this.condition = (e.target as HTMLInputElement).value; }}
                />
                <p class="help-text">
                  Breakpoint triggers when expression is true. Use <span class="help-code">count</span>, <span class="help-code">value</span>, etc.
                </p>
              </div>
            ` : this.breakpointType === "hit" ? html`
              <div class="input-group">
                <label class="input-label">Hit Count</label>
                <div class="hit-condition-row">
                  <select
                    class="hit-condition-select"
                    .value=${this.hitConditionOp}
                    @change=${(e: Event) => { this.hitConditionOp = (e.target as HTMLSelectElement).value as any; }}>
                    <option value="==">==</option>
                    <option value=">=">>=</option>
                    <option value="<="><=</option>
                    <option value="%">multiple of</option>
                  </select>
                  <input
                    type="text"
                    class="input-field"
                    placeholder="3"
                    style="flex: 1;"
                    .value=${this.hitCondition}
                    @input=${(e: Event) => { this.hitCondition = (e.target as HTMLInputElement).value; }}
                  />
                </div>
                <p class="help-text">
                  Breakpoint triggers when hit count matches. <span class="help-code">%</span> means multiple of.
                </p>
              </div>
            ` : html`
              <div class="input-group">
                <label class="input-label">Log Message</label>
                <input
                  type="text"
                  class="input-field"
                  placeholder="Value is {value}"
                  .value=${this.logMessage}
                  @input=${(e: Event) => { this.logMessage = (e.target as HTMLInputElement).value; }}
                />
                <p class="help-text">
                  Message to log. Use <span class="help-code">{expr}</span> for inline evaluation. No stopping.
                </p>
              </div>
            `}
          </div>

          <div class="dialog-footer">
            <button class="button remove" @click=${() => this.remove()}>Remove</button>
            <button class="button secondary" @click=${() => this.close()}>Cancel</button>
            <button class="button primary" @click=${() => this.apply()}>Apply</button>
          </div>
        </div>
      </div>
    `;
  }
}
