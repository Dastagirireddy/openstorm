import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

// Update state machine types
export type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "update-available"; version: string; notes: string }
  | { status: "downloading"; version: string }
  | { status: "installing"; version: string }
  | { status: "completed"; version: string }
  | { status: "error"; message: string };

// Callback type for state changes
export type UpdateStateCallback = (state: UpdateState) => void;

// Singleton updater state manager
class UpdaterManager {
  private state: UpdateState = { status: "idle" };
  private listeners: Set<UpdateStateCallback> = new Set();
  private unlisteners: UnlistenFn[] = [];
  private initialized = false;

  // Initialize event listeners (called once)
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // Listen for update status events from Rust backend
    const unlistenStatus = await listen<{
      status: string;
      version?: string;
      message?: string;
    }>("update-status", (event) => {
      const { status, version, message } = event.payload;
      switch (status) {
        case "downloading":
          this.setState({
            status: "downloading",
            version: version || "",
          });
          break;
        case "installing":
          this.setState({
            status: "installing",
            version: version || "",
          });
          break;
        case "completed":
          this.setState({
            status: "completed",
            version: version || "",
          });
          break;
        case "error":
          this.setState({
            status: "error",
            message: message || "Unknown error",
          });
          break;
      }
    });
    this.unlisteners.push(unlistenStatus);

    // Listen for download progress events
    const unlistenProgress = await listen<{ chunk: number; total: number }>(
      "update-download-progress",
      (_event) => {
        // Progress tracking could be added here if needed
        // For now, we just know downloading is in progress
      }
    );
    this.unlisteners.push(unlistenProgress);
  }

  // Subscribe to state changes
  subscribe(callback: UpdateStateCallback): () => void {
    this.listeners.add(callback);
    // Immediately call with current state
    callback(this.state);
    return () => {
      this.listeners.delete(callback);
    };
  }

  // Get current state
  getState(): UpdateState {
    return this.state;
  }

  // Set state and notify listeners
  private setState(newState: UpdateState): void {
    this.state = newState;
    this.listeners.forEach((callback) => callback(newState));
  }

  // Check for updates (non-blocking)
  async checkForUpdate(): Promise<void> {
    this.setState({ status: "checking" });

    try {
      const result = await invoke<{
        available: boolean;
        version: string;
        notes: string;
      }>("check_for_update");

      if (result.available) {
        this.setState({
          status: "update-available",
          version: result.version,
          notes: result.notes,
        });
      } else {
        this.setState({ status: "idle" });
      }
    } catch (error) {
      this.setState({
        status: "error",
        message: error instanceof Error ? error.message : "Check failed",
      });
    }
  }

  // Download and install update
  async downloadAndInstall(): Promise<void> {
    try {
      await invoke("download_and_install_update");
      // State will be updated via events
    } catch (error) {
      this.setState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Download/install failed",
      });
    }
  }

  // Restart the app
  async restart(): Promise<void> {
    try {
      await invoke("restart_app");
    } catch (error) {
      console.error("[updater] Failed to restart:", error);
    }
  }

  // Dismiss error and return to idle
  dismissError(): void {
    this.setState({ status: "idle" });
  }

  // Dismiss completed state (user chose not to restart)
  dismissCompleted(): void {
    this.setState({ status: "idle" });
  }

  // Cleanup
  destroy(): void {
    this.unlisteners.forEach((unlisten) => unlisten());
    this.unlisteners = [];
    this.listeners.clear();
  }
}

// Export singleton instance
export const updater = new UpdaterManager();

// Legacy function for backward compatibility
export async function checkForUpdates(
  silent = true
): Promise<{ updated: boolean; version: string; notes: string } | null> {
  try {
    const result = await invoke<{
      updated: boolean;
      version: string;
      notes: string;
    }>("check_for_updates");
    if (result.updated) {
      return result;
    }
    return null;
  } catch (error) {
    if (!silent) {
      console.warn("[updater] Check failed:", error);
    }
    return null;
  }
}
