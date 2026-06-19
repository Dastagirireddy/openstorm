import { AI_COMMANDS } from './ai-commands.js';

export interface InputHandlerState {
  showCommands: boolean;
  showFileSuggestions: boolean;
  fileSuggestions: string[];
  selectedCommandIndex: number;
  selectedFileIndex: number;
  commandFilter: string;
  fileFilter: string;
  inputText: string;
  isThinking: boolean;
  searchFilesRequestId: number;
}

export interface InputHandlerActions {
  setShowCommands: (v: boolean) => void;
  setShowFileSuggestions: (v: boolean) => void;
  setSelectedCommandIndex: (v: number) => void;
  setSelectedFileIndex: (v: number) => void;
  setCommandFilter: (v: string) => void;
  setFileFilter: (v: string) => void;
  setInputText: (v: string) => void;
  setSearchFilesRequestId: (v: number) => void;
  getFilteredCommands: () => { name: string; description: string; icon: string }[];
  scrollSelectedIntoView: () => void;
  selectCommand: (cmd: { name: string; description: string }) => void;
  selectFile: (file: string) => void;
  sendMessage: () => void;
  abortRequest: () => void;
  createSession: () => void;
  clearSession: () => void;
  triggerFileSearch: (query: string, requestId: number) => void;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function handleInput(
  e: Event,
  s: InputHandlerState,
  a: InputHandlerActions
) {
  const ta = e.target as HTMLTextAreaElement;
  a.setInputText(ta.value);
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';

  if (ta.value.startsWith('/')) {
    a.setCommandFilter(ta.value);
    a.setShowCommands(true);
    a.setSelectedCommandIndex(0);
    a.setShowFileSuggestions(false);
  } else {
    a.setShowCommands(false);

    const lastAtIndex = ta.value.lastIndexOf('@');
    if (lastAtIndex >= 0) {
      const afterAt = ta.value.slice(lastAtIndex + 1);
      if (afterAt.indexOf(' ') === -1) {
        const searchQuery = afterAt.split('#')[0];
        a.setFileFilter(searchQuery);
        a.setShowFileSuggestions(true);
        a.setSelectedFileIndex(0);
        if (debounceTimer) clearTimeout(debounceTimer);
        const requestId = s.searchFilesRequestId + 1;
        a.setSearchFilesRequestId(requestId);
        debounceTimer = setTimeout(() => {
          a.triggerFileSearch(searchQuery, requestId);
        }, 150);
      } else {
        a.setShowFileSuggestions(false);
      }
    } else {
      a.setShowFileSuggestions(false);
    }
  }
}

export function handleKeyDown(
  e: KeyboardEvent,
  s: InputHandlerState,
  a: InputHandlerActions
) {
  if (s.showCommands) {
    const cmds = a.getFilteredCommands();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      a.setSelectedCommandIndex(Math.min(s.selectedCommandIndex + 1, cmds.length - 1));
      a.scrollSelectedIntoView();
      return;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      a.setSelectedCommandIndex(Math.max(s.selectedCommandIndex - 1, 0));
      a.scrollSelectedIntoView();
      return;
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      a.selectCommand(cmds[s.selectedCommandIndex]);
      return;
    } else if (e.key === 'Escape') {
      a.setShowCommands(false);
      return;
    }
  }

  if (s.showFileSuggestions) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      a.setSelectedFileIndex(Math.min(s.selectedFileIndex + 1, s.fileSuggestions.length - 1));
      a.scrollSelectedIntoView();
      return;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      a.setSelectedFileIndex(Math.max(s.selectedFileIndex - 1, 0));
      a.scrollSelectedIntoView();
      return;
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (s.fileSuggestions.length > 0) {
        e.preventDefault();
        a.selectFile(s.fileSuggestions[s.selectedFileIndex]);
        return;
      }
    } else if (e.key === 'Escape') {
      a.setShowFileSuggestions(false);
      return;
    }
  }

  if (e.key === 'Escape' && s.isThinking) {
    e.preventDefault();
    a.abortRequest();
    return;
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    a.sendMessage();
  } else if (e.key === 'n' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    a.createSession();
  } else if (e.key === 'x' && e.shiftKey && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    a.clearSession();
  }
}

export function getFilteredCommands(filter: string) {
  if (!filter) return AI_COMMANDS;
  return AI_COMMANDS.filter(cmd =>
    cmd.name.toLowerCase().includes(filter.toLowerCase())
  );
}

export function scrollSelectedIntoView(renderRoot: ShadowRoot) {
  requestAnimationFrame(() => {
    const menu = renderRoot.querySelector('.ai-command-menu');
    const selected = menu?.querySelector('.ai-command-item.selected');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  });
}
