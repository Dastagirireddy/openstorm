# AI Panel Enhancement Plan - Match OpenCode TUI Layout

## Overview
Transform the current simple AI chat panel into a full-featured interface matching the OpenCode CLI TUI layout with split-pane design, session management, file attachments, @ completion, and sidebar.

## Current State
- **File**: `src/components/ai/ai-panel.ts`
- **Layout**: Simple vertical stack (header → messages → input)
- **Features**: Basic chat, model selector, tool use display

## Target State (OpenCode TUI Layout)
- **Split-pane layout**: Messages (main) + Editor (bottom) + Sidebar (right, optional)
- **Session management**: Create/switch sessions
- **File attachments**: Up to 5 files per message
- **@ file completion**: Autocomplete files/folders
- **External editor**: Open message in `$EDITOR`
- **Enhanced input**: Markdown support, keyboard shortcuts

---

## Phase 1: Data Models & State Management

### 1.1 Create Session Types
**File**: `src/lib/types/ai-types.ts` (NEW)

```typescript
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
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'thinking' | 'error';
  content: string;
  timestamp: number;
  attachments?: AIAttachment[];
  toolName?: string;
  toolArgs?: string;
  isStreaming?: boolean;
}
```

### 1.2 Create AI State Store
**File**: `src/lib/ai/ai-state.ts` (NEW)

```typescript
export class AIState {
  sessions: AISession[] = [];
  activeSessionId: string | null = null;
  // Methods: createSession, switchSession, addMessage, etc.
}
```

---

## Phase 2: Layout Restructure

### 2.1 Split-Pane Layout
**File**: `src/components/ai/ai-panel.ts` (MODIFY)

Replace current vertical stack with:
```
┌─────────────────────────────────────────┐
│  Header (model selector, session info)  │
├─────────────────────────┬───────────────┤
│                         │               │
│     Messages Area       │   Sidebar     │
│     (scrollable)        │   (optional)  │
│                         │               │
├─────────────────────────┴───────────────┤
│  Editor (textarea + attachments)        │
└─────────────────────────────────────────┘
```

### 2.2 Implement Layout Components
- Use `<resizable-container>` for sidebar resize
- Messages area: flex-1, overflow-y-auto
- Editor: fixed height at bottom
- Sidebar: collapsible, 250px default

---

## Phase 3: Session Management

### 3.1 Session Panel (Sidebar)
**File**: `src/components/ai/ai-sidebar.ts` (NEW)

Features:
- Session list with timestamps
- New session button (Ctrl+N)
- Session search/filter
- Delete session option

### 3.2 Session Persistence
**File**: `src/lib/ai/ai-storage.ts` (NEW)

- Store sessions in localStorage or Tauri store
- Auto-save on message add
- Load sessions on panel open

---

## Phase 4: File Attachments

### 4.1 Attachment UI
**File**: `src/components/ai/ai-attachments.ts` (NEW)

- File picker button in editor
- Attachment chips above textarea
- Remove attachment button
- Max 5 files

### 4.2 File Picker Integration
- Reuse `<file-type-picker>` pattern
- Support file and folder selection
- Read file content for context

---

## Phase 5: @ File Completion

### 5.1 Completion Dialog
**File**: `src/components/ai/ai-completion.ts` (NEW)

- Trigger on `@` key
- Show file/folder list
- Keyboard navigation (arrows + enter)
- Filter as user types

### 5.2 Integration
- Monitor textarea input for `@`
- Show completion dialog as overlay
- Insert selected file path

---

## Phase 6: Enhanced Input

### 6.1 Markdown Support
- Use existing `markdown-it` + `highlight.js`
- Render code blocks with syntax highlighting
- Support for bold, italic, links

### 6.2 External Editor
- Ctrl+E to open in `$EDITOR`
- Temp file creation
- Read content back on close

### 6.3 Keyboard Shortcuts
- Enter: Send message
- Shift+Enter: Newline
- Ctrl+N: New session
- Ctrl+E: External editor
- @: File completion
- Escape: Cancel/close dialogs

---

## Phase 7: Message Rendering

### 7.1 Enhanced Message Display
- User messages: Right-aligned or with user icon
- Assistant messages: Left-aligned with AI icon
- Tool calls: Collapsible details
- Thinking: Animated indicator
- Error: Red styling

### 7.2 Markdown in Messages
- Render assistant messages as markdown
- Code block copy button
- Link handling

---

## Phase 8: Sidebar Components

### 8.1 Session History
- List of previous messages
- Click to jump to message

### 8.2 File Context
- Show attached files
- Quick file preview

### 8.3 Tool History
- Recent tool executions
- Tool results summary

---

## Implementation Order

1. **Phase 1**: Data models & state (foundation)
2. **Phase 2**: Layout restructure (visual structure)
3. **Phase 3**: Session management (core feature)
4. **Phase 4**: File attachments (enhancement)
5. **Phase 5**: @ completion (enhancement)
6. **Phase 6**: Enhanced input (polish)
7. **Phase 7**: Message rendering (polish)
8. **Phase 8**: Sidebar components (final)

---

## Files to Create/Modify

### New Files
- `src/lib/types/ai-types.ts` - AI data types
- `src/lib/ai/ai-state.ts` - State management
- `src/lib/ai/ai-storage.ts` - Persistence
- `src/components/ai/ai-sidebar.ts` - Sidebar component
- `src/components/ai/ai-attachments.ts` - Attachment UI
- `src/components/ai/ai-completion.ts` - @ completion

### Modified Files
- `src/components/ai/ai-panel.ts` - Main panel (major rewrite)
- `src/main.ts` - Update AI tab rendering if needed

---

## Reusable Components

- `<resizable-container>` - For sidebar resize
- `<context-menu>` - For right-click menus
- `<markdown-preview-inline>` - For message rendering
- `<os-icon>` - For icons
- `editor-syntax.ts` - For code highlighting

---

## Testing Strategy

1. Visual testing: Compare with OpenCode TUI screenshots
2. Functional testing: Session create/switch, file attach, @ completion
3. Keyboard testing: All shortcuts work correctly
4. Persistence: Sessions survive restart
5. Performance: Smooth scrolling with many messages

---

## Success Criteria

- [x] Split-pane layout matches OpenCode TUI structure
- [x] Sessions can be created, switched, and deleted
- [x] Files can be attached (up to 5)
- [x] @ completion works for files/folders
- [x] Markdown renders correctly in messages
- [x] All keyboard shortcuts function
- [x] Sidebar shows session context
- [x] State persists across restarts
- [x] Components refactored into separate files (ai-sidebar, ai-attachments, ai-completion)
