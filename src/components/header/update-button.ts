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

  connectedCallback(): void {
    super.connectedCallback();
    updater.initialize();
    this.unsubscribe = updater.subscribe((state) => {
      this.updateState = state;
      // Reset dismissed when state changes to something new
      if (state.status !== "idle" && state.status !== "error") {
        this.dismissed = false;
      }
      // Auto-dismiss errors after 3 seconds
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
        // Start download
        updater.downloadAndInstall();
        break;
      case "completed":
        // Restart the app
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
      case "installing":
        return "loader";
      case "downloading":
        return "download";
      case "update-available":
        return "download";
      case "completed":
        return "download";
      case "error":
        return "alert-triangle";
      default:
        return "cloud";
    }
  }

  private getLabel(): string {
    switch (this.updateState.status) {
      case "checking":
        return "Checking...";
      case "downloading":
        return "Downloading...";
      case "installing":
        return "Installing...";
      case "update-available":
        return `Update v${this.updateState.version}`;
      case "completed":
        return "Restart to Update";
      case "error":
        return "Failed";
      default:
        return "";
    }
  }

  private getTooltip(): string {
    switch (this.updateState.status) {
      case "update-available":
        return `Update to version ${this.updateState.version}`;
      case "completed":
        return `Restart to apply update v${this.updateState.version}`;
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
      this.updateState.status === "installing"
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
    const showDismiss =
      this.updateState.status === "completed" ||
      this.updateState.status === "error";

    return html`
      <button
        class="flex items-center gap-1.5 h-[24px] px-2 rounded bg-transparent border-none cursor-pointer transition-colors duration-150 hover:bg-[var(--app-toolbar-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        ?disabled=${disabled}
        title="${tooltip}"
        @click=${this.handleClick}>
        <os-icon
          name="${icon}"
          color="var(--app-disabled-foreground)"
          width="12"
          class="${spinning ? "animate-spin" : ""}"></os-icon>
        <span
          class="text-[11px] font-medium whitespace-nowrap"
          style="color: var(--app-foreground);">
          ${label}
        </span>
        ${showDismiss
          ? html`
              <os-icon
                name="x"
                color="var(--app-disabled-foreground)"
                width="10"
                class="ml-1 cursor-pointer hover:opacity-80"
                @click=${this.handleDismiss}></os-icon>
            `
          : ""}
      </button>
    `;
  }
}
