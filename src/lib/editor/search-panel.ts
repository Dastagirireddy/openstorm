/**
 * Custom Search Panel — IntelliJ-style find/replace bar
 *
 * Replaces the default CodeMirror search panel with a compact,
 * dark-themed bar positioned at the top-right of the editor.
 */

import { EditorView, Panel } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import {
  SearchQuery,
  setSearchQuery,
  getSearchQuery,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
  closeSearchPanel,
  openSearchPanel,
  SearchCursor,
} from '@codemirror/search';

// --- Replace mode state ---
let replaceModeRequested = false;

export function toggleReplaceMode(view: EditorView) {
  replaceModeRequested = true;
  openSearchPanel(view);
}

function btn(
  label: string,
  title: string,
  onClick: () => void,
  active = false,
): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.title = title;
  b.className = 'cm-search-btn' + (active ? ' cm-search-btn-active' : '');
  b.addEventListener('click', (e) => {
    e.preventDefault();
    onClick();
  });
  return b;
}

function input(placeholder: string, ariaLabel: string): HTMLInputElement {
  const i = document.createElement('input');
  i.type = 'text';
  i.placeholder = placeholder;
  i.setAttribute('aria-label', ariaLabel);
  i.className = 'cm-search-input';
  i.setAttribute('main-field', 'true');
  i.setAttribute('form', '');
  return i;
}

export function createSearchPanel(view: EditorView): Panel {
  const query = getSearchQuery(view.state);
  const q = query;

  // --- DOM ---
  const dom = document.createElement('div');
  dom.className = 'cm-search-panel';
  dom.onkeydown = (e) => keydown(e);

  // Row 1: Search
  const searchRow = document.createElement('div');
  searchRow.className = 'cm-search-row';

  // Replace toggle button
  const replaceToggle = btn('⇄', 'Toggle Replace (Ctrl+H)', () => toggleReplace());
  replaceToggle.className = 'cm-search-btn cm-search-replace-toggle';
  searchRow.appendChild(replaceToggle);

  const searchField = input('Find', 'Search');
  searchField.value = q.search;
  searchRow.appendChild(searchField);

  const countLabel = document.createElement('span');
  countLabel.className = 'cm-search-count';
  countLabel.textContent = '';
  searchRow.appendChild(countLabel);

  const prevBtn = btn('↑', 'Previous', () => findPrevious(view));
  const nextBtn = btn('↓', 'Next', () => findNext(view));
  searchRow.appendChild(prevBtn);
  searchRow.appendChild(nextBtn);

  const regexBtn = btn('.*', 'Regex', () => toggleOption('regexp'), q.regexp);
  const caseBtn = btn('AA', 'Match Case', () => toggleOption('caseSensitive'), q.caseSensitive);
  const wordBtn = btn('Av', 'Whole Word', () => toggleOption('wholeWord'), q.wholeWord);
  searchRow.appendChild(regexBtn);
  searchRow.appendChild(caseBtn);
  searchRow.appendChild(wordBtn);

  const closeBtn = btn('×', 'Close (Esc)', () => closeSearchPanel(view));
  closeBtn.className = 'cm-search-btn cm-search-close';
  searchRow.appendChild(closeBtn);

  dom.appendChild(searchRow);

  // Row 2: Replace
  const replaceRow = document.createElement('div');
  replaceRow.className = 'cm-search-row cm-search-replace-row';

  const replaceField = input('Replace', 'Replace');
  replaceRow.appendChild(replaceField);

  const spacer = document.createElement('span');
  spacer.className = 'cm-search-spacer';
  replaceRow.appendChild(spacer);

  const replaceBtn = btn('Replace', 'Replace Next', () => replaceNext(view));
  replaceBtn.className = 'cm-search-btn cm-search-action';
  replaceRow.appendChild(replaceBtn);

  const replaceAllBtn = btn('All', 'Replace All', () => replaceAll(view));
  replaceAllBtn.className = 'cm-search-btn cm-search-action';
  replaceRow.appendChild(replaceAllBtn);

  dom.appendChild(replaceRow);

  // --- State ---
  let showReplace = replaceModeRequested;
  replaceModeRequested = false;

  function toggleReplace() {
    showReplace = !showReplace;
    replaceRow.style.display = showReplace ? '' : 'none';
    replaceToggle.classList.toggle('cm-search-btn-active', showReplace);
    if (showReplace) {
      replaceField.focus();
    } else {
      searchField.focus();
    }
  }

  // Initialize replace row visibility
  if (showReplace) {
    replaceRow.style.display = '';
    replaceToggle.classList.add('cm-search-btn-active');
    setTimeout(() => replaceField.focus(), 0);
  }
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function updateQuery() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const opts = getCurrentOptions();
      const query = new SearchQuery({
        search: searchField.value,
        replace: replaceField.value,
        caseSensitive: opts.caseSensitive,
        regexp: opts.regexp,
        wholeWord: opts.wholeWord,
      });
      view.dispatch({ effects: setSearchQuery.of(query) });
    }, 50);
  }

  function updateCount() {
    const decorations = view.dom.querySelectorAll('.cm-searchMatch');
    const total = decorations.length;
    const selected = view.dom.querySelectorAll('.cm-searchMatch-selected').length;
    if (total === 0) {
      const query = getSearchQuery(view.state);
      countLabel.textContent = query.search ? 'No results' : '';
    } else {
      countLabel.textContent = `${selected || 1} / ${total}`;
    }
  }

  function getCurrentOptions() {
    const q = getSearchQuery(view.state);
    return {
      caseSensitive: q.caseSensitive,
      regexp: q.regexp,
      wholeWord: q.wholeWord,
    };
  }

  function toggleOption(opt: 'regexp' | 'caseSensitive' | 'wholeWord') {
    const opts = getCurrentOptions();
    const query = new SearchQuery({
      search: searchField.value,
      replace: replaceField.value,
      caseSensitive: opt === 'caseSensitive' ? !opts.caseSensitive : opts.caseSensitive,
      regexp: opt === 'regexp' ? !opts.regexp : opts.regexp,
      wholeWord: opt === 'wholeWord' ? !opts.wholeWord : opts.wholeWord,
    });
    view.dispatch({ effects: setSearchQuery.of(query) });

    // Update toggle button states
    const q2 = getSearchQuery(view.state);
    regexBtn.classList.toggle('cm-search-btn-active', q2.regexp);
    caseBtn.classList.toggle('cm-search-btn-active', q2.caseSensitive);
    wordBtn.classList.toggle('cm-search-btn-active', q2.wholeWord);

    updateCount();
  }

  function keydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSearchPanel(view);
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (document.activeElement === replaceField) {
        replaceNext(view);
      } else {
        findNext(view);
      }
    } else if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      findPrevious(view);
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
      e.preventDefault();
      toggleReplace();
    }
  }

  // --- Event listeners ---
  searchField.addEventListener('input', updateQuery);
  replaceField.addEventListener('input', updateQuery);
  searchField.focus();

  // Initial count
  setTimeout(updateCount, 0);

  // --- Panel API ---
  return {
    dom,
    update() {
      requestAnimationFrame(updateCount);
    },
    destroy() {
      if (debounceTimer) clearTimeout(debounceTimer);
    },
  };
}

// --- Theme ---
const _searchPanelTheme = EditorView.theme({
  '.cm-panels.cm-panels-top': {
    borderBottom: '1px solid var(--app-border)',
    zIndex: '300',
  },
  '.cm-panels.cm-panels-bottom': {
    borderTop: '1px solid var(--app-border)',
  },
  '.cm-search-panel': {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '6px 12px',
    background: 'var(--app-editor-bg, #1e1e2e)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '12px',
  },
  '.cm-search-row': {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  '.cm-search-input': {
    flex: '1',
    maxWidth: '240px',
    height: '24px',
    padding: '0 8px',
    border: '1px solid var(--app-border)',
    borderRadius: '4px',
    background: 'var(--app-input-bg, rgba(255,255,255,0.06))',
    color: 'var(--app-foreground)',
    fontSize: '12px',
    outline: 'none',
    fontFamily: 'inherit',
  },
  '.cm-search-input:focus': {
    borderColor: 'var(--brand-primary)',
  },
  '.cm-search-count': {
    minWidth: '50px',
    textAlign: 'center',
    color: 'var(--app-secondary-foreground, #888)',
    fontSize: '11px',
    userSelect: 'none',
  },
  '.cm-search-spacer': {
    flex: '1',
  },
  '.cm-search-btn': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '24px',
    height: '24px',
    padding: '0 4px',
    border: 'none',
    borderRadius: '4px',
    background: 'transparent',
    color: 'var(--app-secondary-foreground, #aaa)',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontWeight: '500',
  },
  '.cm-search-btn:hover': {
    background: 'var(--app-hover-background, rgba(255,255,255,0.08))',
  },
  '.cm-search-btn-active': {
    background: 'var(--brand-primary)',
    color: 'var(--app-foreground, #fff)',
  },
  '.cm-search-btn-active:hover': {
    background: 'var(--brand-primary)',
    opacity: '0.9',
  },
  '.cm-search-close': {
    marginLeft: '4px',
    fontSize: '14px',
    fontWeight: '600',
  },
  '.cm-search-action': {
    padding: '0 8px',
    height: '24px',
    fontSize: '11px',
    fontWeight: '500',
    color: 'var(--app-foreground, #ccc)',
    background: 'var(--app-hover-background, rgba(255,255,255,0.06))',
    border: '1px solid var(--app-border)',
    borderRadius: '4px',
  },
  '.cm-search-action:hover': {
    background: 'var(--app-toolbar-active, rgba(255,255,255,0.1))',
  },
  '.cm-search-replace-toggle': {
    minWidth: '24px',
    fontSize: '13px',
  },
  '.cm-search-replace-row': {
    paddingLeft: '0',
  },
});
export const searchPanelTheme = Prec.highest(_searchPanelTheme);
