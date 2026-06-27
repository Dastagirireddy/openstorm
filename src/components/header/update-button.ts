import { html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { TailwindElement } from "../../tailwind-element.js";
import { updater, type UpdateState } from "../../services/updater.js";
import "../layout/icon.js";

@customElement("update-button")
export class UpdateButton extends TailwindElement() {
  @state() private updateState: UpdateState = { status: "idle" };
  @state() private dismissed = false;

  private unsubscribe?: () => void;
  private errorTimeout?: ReturnType<typeof setTimeout>;

  static styles = css`
    :host {
      display: inline-flex;
      align-items: center;
      height: 100%;
    }

    .update-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 18px;
      padding: 0 8px;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
      white-space: nowrap;
      transition: background 0.15s ease, color 0.15s ease;
      position: relative;
    }

    /* Idle — hidden */
    .state-idle {
      display: none;
    }

    /* Checking — subtle text with spinner */
    .state-checking {
      background: transparent;
      color: var(--app-foreground);
      opacity: 0.7;
    }

    /* Update Available — brand indigo background, white text */
    .state-available {
      background: var(--app-button-background);
      color: var(--app-button-foreground);
    }
    .state-available:hover {
      background: var(--app-button-hover);
    }

    /* Downloading — brand indigo with lower opacity */
    .state-downloading {
      background: color-mix(in srgb, var(--app-button-background) 80%, transparent);
      color: var(--app-button-foreground);
    }

    /* Installing — brand indigo with even lower opacity, pulsing */
    .state-installing {
      background: color-mix(in srgb, var(--app-button-background) 60%, transparent);
      color: var(--app-button-foreground);
      animation: pulse-opacity 1.2s ease-in-out infinite;
    }

    /* Completed — success green */
    .state-completed {
      background: var(--app-continue-color);
      color: #fff;
    }
    .state-completed:hover {
      background: color-mix(in srgb, var(--app-continue-color) 85%, #000);
    }

    /* Error — error red */
    .state-error {
      background: var(--app-breakpoint);
      color: #fff;
    }

    .icon-wrap {
      display: flex;
      align-items: center;
      flex-shrink: 0;
      line-height: 0;
    }

    .label {
      line-height: 1;
    }

    .dismiss-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 12px;
      height: 12px;
      border-radius: 2px;
      background: rgba(255, 255, 255, 0.2);
      border: none;
      cursor: pointer;
      padding: 0;
      margin-left: 2px;
      transition: background 0.15s ease;
      flex-shrink: 0;
    }
    .dismiss-btn:hover {
      background: rgba(255, 255, 255, 0.35);
    }

    .disabled {
      opacity: 0.6;
      cursor: not-allowed;
      pointer-events: none;
    }

    .spin {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @keyframes pulse-opacity {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    updater.initialize();
    this.unsubscribe = updater.subscribe((state) => {
      this.updateState = state;
      if (state.status !== "idle" && state.status !== "error") {
        this.dismissed = false;
      }
      if (state.status === "error") {
        clearTimeout(this.errorTimeout);
        this.errorTimeout = setTimeout(() => {
          this.dismissed = true;
        }, 3000);
      }
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.unsubscribe?.();
    clearTimeout(this.errorTimeout);
  }

  private handleClick(): void {
    switch (this.updateState.status) {
      case "update-available":
        updater.downloadAndInstall();
        break;
      case "completed":
        updater.restart();
        break;
    }
  }

  private handleDismiss(e: Event): void {
    e.stopPropagation();
    this.dismissed = true;
    if (this.updateState.status === "error") {
      updater.dismissError();
    } else if (this.updateState.status === "completed") {
      updater.dismissCompleted();
    }
  }

  private getIcon(): string {
    switch (this.updateState.status) {
      case "checking":
        return "loader";
      case "installing":
        return "loader";
      case "downloading":
        return "arrow-down-to-line";
      case "update-available":
        return "arrow-down-to-line";
      case "completed":
        return "rotate-ccw";
      case "error":
        return "alert-triangle";
      default:
        return "cloud";
    }
  }

  private getStateClass(): string {
    switch (this.updateState.status) {
      case "checking": return "state-checking";
      case "downloading": return "state-downloading";
      case "installing": return "state-installing";
      case "update-available": return "state-available";
      case "completed": return "state-completed";
      case "error": return "state-error";
      default: return "state-idle";
    }
  }

  private getLabel(): string {
    switch (this.updateState.status) {
      case "checking":
        return "Checking";
      case "downloading":
        return "Downloading";
      case "installing":
        return "Installing";
      case "update-available":
        return "Update available";
      case "completed":
        return "Restart";
      case "error":
        return "Failed";
      default:
        return "";
    }
  }

  private getTooltip(): string {
    switch (this.updateState.status) {
      case "update-available":
        return `Update available: v${this.updateState.version}`;
      case "completed":
        return `Click to restart and apply v${this.updateState.version}`;
      case "error":
        return this.updateState.message;
      default:
        return "";
    }
  }

  private isDisabled(): boolean {
    return (
      this.updateState.status === "checking" ||
      this.updateState.status === "downloading" ||
      this.updateState.status === "installing"
    );
  }

  private shouldShow(): boolean {
    return (
      !this.dismissed &&
      this.updateState.status !== "idle" &&
      this.updateState.status !== "error"
    );
  }

  private isSpinning(): boolean {
    return (
      this.updateState.status === "checking" ||
      this.updateState.status === "installing" ||
      this.updateState.status === "downloading"
    );
  }

  render() {
    if (!this.shouldShow()) {
      return nothing;
    }

    const icon = this.getIcon();
    const label = this.getLabel();
    const tooltip = this.getTooltip();
    const disabled = this.isDisabled();
    const spinning = this.isSpinning();
    const stateClass = this.getStateClass();
    const showDismiss =
      this.updateState.status === "completed" ||
      this.updateState.status === "error";

    return html`
      <button
        class="update-btn ${stateClass} ${disabled ? "disabled" : ""}"
        title="${tooltip}"
        @click=${this.handleClick}>
        <span class="icon-wrap">
          <os-icon
            name="${icon}"
            color="currentColor"
            width="12"
            class="${spinning ? "spin" : ""}"></os-icon>
        </span>
        <span class="label">${label}</span>
        ${showDismiss
          ? html`
              <button
                class="dismiss-btn"
                title="Dismiss"
                @click=${this.handleDismiss}>
                <os-icon name="x" color="currentColor" width="8"></os-icon>
              </button>
            `
          : ""}
      </button>
    `;
  }
}
