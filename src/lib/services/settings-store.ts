export interface UserSettings {
  zoom: number;
  vimMode: boolean;
  autoSave: boolean;
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  lineNumbers: boolean;
  minimap: boolean;
  explorerAutoReveal: boolean;
  explorerIndentGuides: boolean;
  terminalCursorBlink: boolean;
  terminalScrollback: number;
}

const STORAGE_KEY = 'openstorm-user-settings';

const DEFAULTS: UserSettings = {
  zoom: 100,
  vimMode: false,
  autoSave: true,
  fontSize: 14,
  tabSize: 2,
  wordWrap: false,
  lineNumbers: true,
  minimap: true,
  explorerAutoReveal: true,
  explorerIndentGuides: true,
  terminalCursorBlink: true,
  terminalScrollback: 1000,
};

class SettingsStore {
  private settings: UserSettings;
  private listeners: Array<() => void> = [];

  constructor() {
    this.settings = this.load();
  }

  private load(): UserSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return { ...DEFAULTS, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.warn('[Settings] Failed to load settings:', e);
    }
    return { ...DEFAULTS };
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch (e) {
      console.warn('[Settings] Failed to save settings:', e);
    }
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  get<K extends keyof UserSettings>(key: K): UserSettings[K] {
    return this.settings[key];
  }

  getAll(): UserSettings {
    return { ...this.settings };
  }

  set<K extends keyof UserSettings>(key: K, value: UserSettings[K]): void {
    if (this.settings[key] !== value) {
      this.settings[key] = value;
      this.save();
    }
  }

  update(partial: Partial<UserSettings>): void {
    let changed = false;
    for (const [key, value] of Object.entries(partial)) {
      const k = key as keyof UserSettings;
      if (this.settings[k] !== value) {
        (this.settings as any)[k] = value;
        changed = true;
      }
    }
    if (changed) {
      this.save();
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  reset(): void {
    this.settings = { ...DEFAULTS };
    this.save();
  }
}

export const settingsStore = new SettingsStore();
