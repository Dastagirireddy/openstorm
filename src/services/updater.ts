import { invoke } from "@tauri-apps/api/core";

interface UpdateResult {
  updated: boolean;
  version: string;
  notes: string;
}

export async function checkForUpdates(silent = true): Promise<UpdateResult | null> {
  try {
    const result = await invoke<UpdateResult>("check_for_updates");
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
