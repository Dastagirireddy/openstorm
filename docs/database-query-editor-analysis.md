# Database Query Editor Analysis

**Research Date:** May 2026  
**Context:** OpenStorm has existing database tree panel (right sidebar). Need to design the query editor + results area.

---

## Problem Statement

The classic "editor above, results below" pattern (DataGrip/IntelliJ) has workflow issues:

1. **Repetitive query execution** requires selecting text → running → re-selecting
2. **Limited vertical space** for results when editor is visible
3. **Context switching** between writing and viewing results
4. **No query organization** - just a blank text area

---

## Neo4j Browser Style: Recommended Approach

### Layout Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  💾 Saved    📜 History    📚 Snippets    ⚙ Settings                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Query Editor (Card 1)                                                │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │ SELECT * FROM users WHERE created_at > '2025-01-01'             │  │  │
│  │  │ ORDER BY created_at DESC LIMIT 50;                              │  │  │
│  │  │                                                                 │  │  │
│  │  │                                      [▶ Run] [📋 Format] [⋮]    │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                       │  │
│  │  Results                                                              │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │ [📊 Table] [🃏 Cards] [📈 Chart] [⏱ Explain] [⬇ Export]        │  │  │
│  │  ├─────────────────────────────────────────────────────────────────┤  │  │
│  │  │ id │ name       │ email            │ created_at │ status        │  │  │
│  │  │────┼────────────┼──────────────────┼────────────┼───────────────│  │  │
│  │  │ 1  │ John Doe   │ john@example.com │ 2025-05-01 │ active        │  │  │
│  │  │ 2  │ Jane Smith │ jane@example.com │ 2025-04-28 │ active        │  │  │
│  │  │ 3  │ Bob Wilson │ bob@example.com  │ 2025-04-25 │ inactive      │  │  │
│  │  │   ... 47 more rows                                              │  │  │
│  │  │                                                                 │  │  │
│  │  │ 156 rows returned • 23ms                            [1-50 ▼]    │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Query Editor (Card 2) - user_orders.sql                              │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │ SELECT u.name, COUNT(o.id) as order_count                       │  │  │
│  │  │ FROM users u                                                    │  │  │
│  │  │ LEFT JOIN orders o ON u.id = o.user_id                          │  │  │
│  │  │ GROUP BY u.id, u.name                                           │  │  │
│  │  │ HAVING COUNT(o.id) > 5                                          │  │  │
│  │  │                                                                 │  │  │
│  │  │                                      [▶ Run] [📋 Format] [⋮]    │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                       │  │
│  │  [Click ▶ to run query - results will appear below]                  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  [+ Add Query Card]                                                   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

### 1. Query Cards (Not One Big Editor)

Instead of one monolithic editor, use **discrete query cards**:

| Feature | Benefit |
|---------|---------|
| Each query in its own card | Clear separation of concerns |
| Run queries independently | No need to select text |
| Collapse/expand cards | Focus on active queries |
| Reorder via drag-drop | Organize workflow visually |
| Save individual cards | Reusable query snippets |
| Pin important cards | Keep reference queries visible |

### 2. Execution Patterns

**Neo4j Approach:**
```
┌─────────────────────────────────────────┐
│ [Editor Content]                        │
│                                         │
│                              [▶ Run]    │ ← Run button ON editor
└─────────────────────────────────────────┘
         ▼ (results appear below)
┌─────────────────────────────────────────┐
│ [Results Table/Cards]                   │
└─────────────────────────────────────────┘
```

**Why This Works:**
- ✅ **No text selection needed** - Run button is part of the card
- ✅ **Clear visual pairing** - Results always appear below their query
- ✅ **Multiple queries visible** - Compare results side-by-side (vertically)
- ✅ **Keyboard shortcut** - `Ctrl/Cmd + Enter` runs focused card

### 3. Results View Toggles

Each query result supports multiple views:

```
┌─────────────────────────────────────────────────────────────┐
│ [📊 Table] [🃏 Cards] [📈 Chart] [⏱ Explain] [📋 JSON]      │
├─────────────────────────────────────────────────────────────┤
```

| View | Use Case |
|------|----------|
| **Table** | Default - scanning, comparing, editing data |
| **Cards** | Detailed record view, rich content |
| **Chart** | Quick visualization (bar, line, pie from results) |
| **Explain** | Query plan visualization |
| **JSON** | Raw output, API debugging |

---

## Comparison: Classic vs Neo4j-Style

| Aspect | Classic (DataGrip) | Neo4j Browser Style |
|--------|-------------------|---------------------|
| **Editor Layout** | One large text area | Multiple query cards |
| **Execution** | Select text → Run | Click ▶ on card |
| **Results Position** | Bottom panel (shared) | Below each query |
| **Multiple Queries** | Tabs or stacked results | Multiple cards visible |
| **Query Organization** | File-based or history | Visual cards, draggable |
| **Re-running** | Re-select or find in history | Click ▶ on same card |
| **Context Preservation** | Lost when switching tabs | Cards stay in place |

---

## Recommended Component Structure

### Query Card Component

```
┌─────────────────────────────────────────────────────────────┐
│  Query Card                                                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Header: [📄 users_by_status.sql]    [📌] [⬍] [⋮]    │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │  CodeMirror 6 Editor (auto-resize height)             │  │
│  │  - Syntax highlighting (SQL dialect)                  │  │
│  │  - Schema autocomplete                                │  │
│  │  - Minimap (for long queries)                         │  │
│  │  - Parameter hints (:status)                          │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │  Footer: [▶ Run Ctrl+Enter] [📋 Format] [⏱ 23ms]     │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  Results Panel (collapsible)                                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  View Toolbar                                         │  │
│  │  [📊 Table] [🃏 Cards] [📈 Chart] [⏱ Explain] [⬇]    │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │  [Actual Results Content]                             │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │  Status Bar: 156 rows • 23ms • 2.4KB     [1-50 ▼]    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### State Management

```typescript
interface QueryCard {
  id: string;
  title: string;           // Auto from filename or "Untitled Query"
  query: string;           // SQL content
  dialect: 'postgresql' | 'mysql' | 'sqlite';
  connectionId: string;    // Which DB to run against
  lastRun?: Date;
  duration?: number;       // Last execution time in ms
  result?: QueryResult;
  viewMode: 'table' | 'cards' | 'chart' | 'explain';
  collapsed: boolean;      // Is results panel collapsed?
  pinned: boolean;         // Keep card visible
}

interface QueryResult {
  rows: Record<string, unknown>[];
  columns: ColumnInfo[];
  rowCount: number;
  affectedRows?: number;
  error?: QueryError;
  explainPlan?: ExplainNode[];  // For EXPLAIN queries
}
```

---

## Workflow Examples

### Scenario 1: Iterative Query Development

```
1. User creates new query card
2. Types: SELECT * FROM users
3. Clicks ▶ (or Ctrl+Enter)
4. Results appear below instantly
5. User modifies: WHERE status = 'active'
6. Clicks ▶ again - same card, new results
7. No selection needed, no context lost
```

### Scenario 2: Comparing Multiple Queries

```
┌─────────────────────────────────────────────────┐
│ Card 1: Active Users                            │
│ SELECT * FROM users WHERE status = 'active'     │
│ [▶ Run]                                         │
│ └─ Results: 45 rows                             │
├─────────────────────────────────────────────────┤
│ Card 2: Inactive Users                          │
│ SELECT * FROM users WHERE status = 'inactive'   │
│ [▶ Run]                                         │
│ └─ Results: 12 rows                             │
├─────────────────────────────────────────────────┤
│ Card 3: Total Count                             │
│ SELECT COUNT(*) FROM users                      │
│ [▶ Run]                                         │
│ └─ Results: 57                                  │
└─────────────────────────────────────────────────┘
All visible, all comparable, no tab switching
```

### Scenario 3: Saved Query Library

```
User saves frequently-used queries as cards:
- "📊 Daily Active Users"
- "🔍 Users by Signup Date"
- "⚠️ Failed Logins (24h)"

Cards persist in workspace.
Click ▶ anytime to re-run.
Share cards with team (export/import).
```

---

## Advanced Features (Future Phases)

### 1. Query Parameters

```sql
-- :start_date and :end_date become input fields
SELECT * FROM orders
WHERE created_at BETWEEN :start_date AND :end_date
```

Renders parameter inputs above results:
```
┌─────────────────────────────────────────────┐
│ start_date: [2025-01-01 📅]                 │
│ end_date:   [2025-05-01 📅]                 │
│ [▶ Run with Parameters]                     │
└─────────────────────────────────────────────┘
```

### 2. Query Plan Visualization

```
┌─────────────────────────────────────────────────────────────┐
│ Query Plan (Total: 2.3ms)                                   │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Seq Scan on users                                   │    │
│  │ Cost: 0.00..35.50  Rows: 1000                       │    │
│  │ Filter: (created_at > '2025-01-01')                 │    │
│  └─────────────────────────────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Hash Join                                           │    │
│  │ Cost: 50.00..200.00  Rows: 500                      │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 3. Chart View (Quick Visualization)

```
From query results, auto-generate charts:

SELECT DATE(created_at) as date, COUNT(*) as count
FROM users
GROUP BY DATE(created_at)

→ Auto-suggests line chart
→ Shows signup trend over time
```

### 4. AI Assistant Integration

```
┌─────────────────────────────────────────────────────────────┐
│ 💡 AI Suggestions                                           │
├─────────────────────────────────────────────────────────────┤
│ • Add index on created_at for faster filtering              │
│ • Consider pagination for large result sets                 │
│ • Query could use EXISTS instead of IN for performance      │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation for OpenStorm

### Recommended Layout (With Existing Right Sidebar Tree)

```
┌─────────────────────────────────────────────────────────────────────┐
│  OpenStorm IDE                                                      │
├──────────────────────────────┬──────────────────────────────────────┤
│                              │  Database Tree (existing)            │
│   Query Editor Area          │  ┌─ 🟢 PostgreSQL                   │
│   (Neo4j-style cards)        │  │  ├─ public                       │
│                              │  │  │  ├─ 📄 users                  │
│  ┌────────────────────────┐  │  │  │  ├─ 📄 orders                 │
│  │ Query Card 1           │  │  │  │  └─ 📄 products               │
│  │ [Editor]               │  │  │  └─ views                        │
│  │ [▶ Run]                │  │  └─ functions                       │
│  │ [Results]              │  │                                     │
│  └────────────────────────┘  │  ⭐ Favorites                       │
│                              │  📜 History                         │
│  ┌────────────────────────┐  │                                     │
│  │ Query Card 2           │  │  [Connection Settings]              │
│  │ [Editor]               │  └─────────────────────────────────────┤
│  │ [▶ Run]                │                                       │
│  │ [Results]              │                                       │
│  └────────────────────────┘                                       │
│                                                                   │
│  ┌────────────────────────┐                                       │
│  │ [+ Add Query Card]     │                                       │
│  └────────────────────────┘                                       │
└──────────────────────────────┴─────────────────────────────────────┘
```

### Phase 1: MVP

```
Priority: HIGH
┌─────────────────────────────────────────────────────────────┐
│ 1. Query Card Component                                     │
│    - CodeMirror 6 editor                                    │
│    - Run button (executes full content)                     │
│    - Basic keyboard shortcut (Ctrl+Enter)                   │
├─────────────────────────────────────────────────────────────┤
│ 2. Results Table                                            │
│    - Virtual scrolling grid                                 │
│    - Column resize/sort                                     │
│    - Pagination (100 rows per page)                         │
│    - CSV export                                             │
├─────────────────────────────────────────────────────────────┤
│ 3. Card Management                                          │
│    - Add new card                                           │
│    - Delete card                                            │
│    - Collapse/expand results                                │
│    - Reorder cards (drag-drop)                              │
└─────────────────────────────────────────────────────────────┘
```

### Phase 2: Enhanced UX

```
Priority: MEDIUM
┌─────────────────────────────────────────────────────────────┐
│ 4. View Toggles                                             │
│    - Table view (default)                                   │
│    - Card view (for detailed records)                       │
│    - JSON view (raw output)                                 │
├─────────────────────────────────────────────────────────────┤
│ 5. Query Persistence                                        │
│    - Save cards to workspace                                │
│    - Auto-save on edit                                      │
│    - Load on project open                                   │
├─────────────────────────────────────────────────────────────┤
│ 6. Connection Binding                                       │
│    - Each card binds to selected DB from tree               │
│    - Show connection badge on card                          │
│    - Switch connection per card                             │
└─────────────────────────────────────────────────────────────┘
```

### Phase 3: Advanced

```
Priority: LOW
┌─────────────────────────────────────────────────────────────┐
│ 7. Query Plan Viewer                                        │
│    - EXPLAIN query support                                  │
│    - Visual tree diagram                                    │
│    - Cost/row estimates                                     │
├─────────────────────────────────────────────────────────────┤
│ 8. Chart View                                               │
│    - Auto-detect chartable data                             │
│    - Bar, line, pie charts                                  │
│    - Export as PNG                                          │
├─────────────────────────────────────────────────────────────┤
│ 9. Parameter Support                                        │
│    - :param syntax                                          │
│    - Input field generation                                 │
│    - Parameterized query execution                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Technical Recommendations

### CodeMirror 6 Configuration

```typescript
import { EditorView, keymap } from '@codemirror/view';
import { sql } from '@codemirror/lang-sql';

const createQueryEditor = (container: Element, options: {
  dialect: 'postgresql' | 'mysql' | 'sqlite';
  schemaCompletion?: CompletionSource;
  onRun: () => void;
}) => {
  return new EditorView({
    extensions: [
      sql({ dialect: options.dialect }),
      keymap.of([
        { key: 'Mod-Enter', run: () => { options.onRun(); return true; } }
      ]),
      // Schema autocomplete from database tree
      options.schemaCompletion,
    ],
    parent: container,
  });
};
```

### Card State (Lit Signals)

```typescript
import { signal } from '@preact/signals-core';

class QueryEditorPanel {
  private cards = signal<QueryCard[]>([]);
  private activeCard = signal<string | null>(null);

  addCard() {
    const newCard: QueryCard = {
      id: crypto.randomUUID(),
      title: `Query ${this.cards.value.length + 1}`,
      query: '',
      dialect: 'postgresql',
      connectionId: this.selectedConnection,
      viewMode: 'table',
      collapsed: false,
      pinned: false,
    };
    this.cards.value = [...this.cards.value, newCard];
    this.activeCard.value = newCard.id;
  }

  runCard(cardId: string) {
    const card = this.cards.value.find(c => c.id === cardId);
    if (!card) return;

    // Execute via Tauri command
    invoke('db_execute_query', {
      connection_id: card.connectionId,
      query: card.query,
    }).then(result => {
      card.result = result;
      card.duration = result.duration;
      this.cards.value = [...this.cards.value];
    });
  }
}
```

---

## Why Neo4j-Style Over Classic

### Your Pain Points → Neo4j Solutions

| Your Problem | Neo4j Solution |
|--------------|----------------|
| Selecting text repeatedly | Run button on each card - no selection |
| Re-running same query | Click ▶ on same card - query stays |
| Losing context | Cards persist, results below each |
| Editor/results fighting for space | Collapse results, scroll cards |

### Research-Backed Decision

The Neo4j pattern aligns with **notebook-style workflows** (Jupyter, Observable) that have proven successful for:
- **Iterative exploration** - Run, modify, re-run cycle
- **Documentation** - Queries self-document with results
- **Sharing** - Cards can be exported/shared individually
- **Learning** - See query + result pairing clearly

---

## Final Recommendation

**Adopt Neo4j Browser-style query cards** for OpenStorm:

1. **Discrete query cards** - Each query in its own runnable card
2. **Results below each card** - Clear visual pairing
3. **Table/Cards/Chart toggles** - Flexible result views
4. **Drag-drop organization** - Arrange cards by workflow
5. **Persist cards in workspace** - Reusable query library

This approach directly solves your stated pain points with the classic editor-below-results pattern while maintaining the professional density expected in enterprise IDEs.

---

*Document generated for OpenStorm IDE query editor planning.*
