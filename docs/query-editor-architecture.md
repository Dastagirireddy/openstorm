# Database Query Editor Architecture

**Neo4j-Style: 1/4 Editor + 3/4 Card Results**

---

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Database Panel                                                 │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  QUERY EDITOR (25% height)                                │  │
│  │  - CodeMirror 6 with SQL highlighting                     │  │
│  │  - Schema autocomplete                                    │  │
│  │  - Run button (Ctrl+Enter)                                │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  QUERY CARDS (75% height - scrollable)                    │  │
│  │  - Card grid showing query results                        │  │
│  │  - View toggle: Table / Cards / JSON                      │  │
│  │  - Pagination and export                                  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
src/
└── components/panels/data-sources/
    ├── query-editor/
    │   ├── query-editor.ts           # Main container component
    │   ├── sql-editor.ts             # CodeMirror 6 wrapper
    │   ├── results-cards.ts          # Card grid display
    │   ├── results-table.ts          # Table view (alternate)
    │   ├── results-json.ts           # JSON view (alternate)
    │   ├── query-card.ts             # Individual result card
    │   └── view-toggle.ts            # Table/Cards/JSON toggle
    │
    └── workspace/
        ├── queries-store.ts          # queries.json persistence
        └── query-types.ts            # Shared type definitions

src-tauri/src/
└── database/
    ├── query/
    │   ├── mod.rs                  # Query module entry
    │   ├── executor.rs             # Query execution service
    │   ├── streaming.rs            # Channel-based streaming
    │   └── types.rs                # Query-specific types
    │
    └── workspace/
        ├── mod.rs                  # Workspace persistence
        └── queries.rs              # queries.json CRUD
```

---

## Component Hierarchy

```
<database-panel>
  │
  ├── <database-multi-tree> (existing - right sidebar)
  │
  └── <query-editor> (new - main area)
       │
       ├── <sql-editor> (1/4 height)
       │    └── CodeMirror 6 instance
       │
       └── <results-container> (3/4 height)
            │
            ├── <view-toggle>
            │
            └── <results-cards> | <results-table> | <results-json>
                 └── <query-card> × N (for cards view)
```

---

## State Management (Signals)

```typescript
interface QueryEditorState {
  // Editor state
  sql: string;
  dialect: 'postgresql' | 'mysql';
  isDirty: boolean;
  
  // Execution state
  status: 'idle' | 'running' | 'complete' | 'error';
  lastError: string | null;
  executionTime: number | null;
  
  // Results state
  results: QueryResult | null;
  viewMode: 'table' | 'cards' | 'json';
  currentPage: number;
  rowsPerPage: number;
  
  // Workspace state
  savedQueries: SavedQuery[];
  activeConnectionId: string | null;
}

interface QueryResult {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
}

interface SavedQuery {
  id: string;
  title: string;
  sql: string;
  connectionId: string;
  lastRun: string | null;
  createdAt: string;
  updatedAt: string;
}
```

---

## Rust Backend Architecture

### Query Executor Service

```rust
// src/database/query/executor.rs

use sqlx::{Pool, Postgres, MySql, Row};
use tokio::sync::mpsc;

pub struct QueryExecutor {
    // Pool management handled by DatabaseManager
}

impl QueryExecutor {
    /// Execute a query and stream results back via channel
    pub async fn execute_streaming(
        pool: &AnyPool,
        query: &str,
        tx: mpsc::Sender<QueryResultChunk>,
    ) -> Result<QuerySummary, DatabaseError> {
        let start = std::time::Instant::now();
        let mut row_count = 0u64;
        
        match pool {
            AnyPool::Postgres(pool) => {
                let rows = sqlx::query(query).fetch_all(pool).await?;
                row_count = rows.len() as u64;
                
                // Send in batches of 100
                for chunk in rows.chunks(100) {
                    tx.send(QueryResultChunk::from_rows(chunk)).await.ok();
                }
            }
            AnyPool::MySql(pool) => {
                let rows = sqlx::query(query).fetch_all(pool).await?;
                row_count = rows.len() as u64;
                
                for chunk in rows.chunks(100) {
                    tx.send(QueryResultChunk::from_rows(chunk)).await.ok();
                }
            }
            _ => return Err(DatabaseError::UnsupportedDatabaseType(
                "Query execution only supports PostgreSQL and MySQL".into()
            )),
        }
        
        Ok(QuerySummary {
            row_count,
            execution_time_ms: start.elapsed().as_millis() as u64,
        })
    }
}
```

### Workspace Persistence

```rust
// src/database/workspace/queries.rs

use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedQuery {
    pub id: String,
    pub title: String,
    pub sql: String,
    pub connection_id: String,
    pub last_run: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub struct QueriesWorkspace {
    project_path: PathBuf,
}

impl QueriesWorkspace {
    pub fn new(project_path: &Path) -> Self {
        Self {
            project_path: project_path.to_path_buf(),
        }
    }
    
    fn queries_file(&self) -> PathBuf {
        self.project_path
            .join(".openstorm")
            .join("databases")
            .join("queries.json")
    }
    
    pub fn load_queries(&self) -> Result<Vec<SavedQuery>, DatabaseError> {
        let path = self.queries_file();
        if !path.exists() {
            return Ok(Vec::new());
        }
        
        let content = std::fs::read_to_string(&path)?;
        let queries: Vec<SavedQuery> = serde_json::from_str(&content)?;
        Ok(queries)
    }
    
    pub fn save_query(&self, query: &SavedQuery) -> Result<(), DatabaseError> {
        let mut queries = self.load_queries()?;
        
        // Update or insert
        if let Some(existing) = queries.iter_mut().find(|q| q.id == query.id) {
            *existing = query.clone();
        } else {
            queries.push(query.clone());
        }
        
        // Ensure directory exists
        if let Some(parent) = self.queries_file().parent() {
            std::fs::create_dir_all(parent)?;
        }
        
        let content = serde_json::to_string_pretty(&queries)?;
        std::fs::write(self.queries_file(), content)?;
        Ok(())
    }
    
    pub fn delete_query(&self, query_id: &str) -> Result<(), DatabaseError> {
        let mut queries = self.load_queries()?;
        queries.retain(|q| q.id != query_id);
        
        let content = serde_json::to_string_pretty(&queries)?;
        std::fs::write(self.queries_file(), content)?;
        Ok(())
    }
}
```

---

## Tauri Commands

```rust
// src/commands/database/query.rs

use crate::database::{DatabaseManager, AnyPool};
use crate::database::query::executor::QueryExecutor;
use crate::database::workspace::queries::{QueriesWorkspace, SavedQuery};

/// Execute a query and return results
#[tauri::command]
pub async fn db_execute_query(
    connection_id: String,
    query: String,
    project_path: String,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<QueryResult, String> {
    let pool = state.get_or_create_pool(/* config */).await
        .map_err(|e| e.to_string())?;
    
    let result = QueryExecutor::execute(&pool, &query).await
        .map_err(|e| e.to_string())?;
    
    Ok(result)
}

/// Save a query to workspace
#[tauri::command]
pub async fn db_save_query(
    project_path: String,
    query: SavedQuery,
) -> Result<(), String> {
    let workspace = QueriesWorkspace::new(Path::new(&project_path));
    workspace.save_query(&query)
        .map_err(|e| e.to_string())
}

/// Load all saved queries for a connection
#[tauri::command]
pub async fn db_load_queries(
    project_path: String,
    connection_id: Option<String>,
) -> Result<Vec<SavedQuery>, String> {
    let workspace = QueriesWorkspace::new(Path::new(&project_path));
    let queries = workspace.load_queries()
        .map_err(|e| e.to_string())?;
    
    // Filter by connection if provided
    let filtered = match connection_id {
        Some(id) => queries.into_iter().filter(|q| q.connection_id == id).collect(),
        None => queries,
    };
    
    Ok(filtered)
}

/// Delete a saved query
#[tauri::command]
pub async fn db_delete_query(
    project_path: String,
    query_id: String,
) -> Result<(), String> {
    let workspace = QueriesWorkspace::new(Path::new(&project_path));
    workspace.delete_query(&query_id)
        .map_err(|e| e.to_string())
}
```

---

## Frontend Component Implementation

### Main Container

```typescript
// src/components/panels/data-sources/query-editor/query-editor.ts

import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { signal } from '@preact/signals-core';

@customElement('query-editor')
export class QueryEditor extends LitElement {
  @property() projectPath: string | null = null;
  @property() activeConnectionId: string | null = null;
  
  @state() private sql = '';
  @state() private dialect: 'postgresql' | 'mysql' = 'postgresql';
  @state() private status: 'idle' | 'running' | 'complete' | 'error' = 'idle';
  @state() private results: QueryResult | null = null;
  @state() private viewMode: 'table' | 'cards' | 'json' = 'cards';
  @state() private savedQueries: SavedQuery[] = [];
  
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }
    
    .editor-container {
      height: 25%;
      min-height: 120px;
      border-bottom: 1px solid var(--app-border);
    }
    
    .results-container {
      height: 75%;
      overflow-y: auto;
      padding: var(--space-2);
    }
  `;
  
  render() {
    return html`
      <div class="editor-container">
        <sql-editor
          .sql=${this.sql}
          .dialect=${this.dialect}
          @change=${this._onSqlChange}
          @run=${this._onRun}
          @save=${this._onSave}
        ></sql-editor>
      </div>
      
      <div class="results-container">
        ${this._renderResults()}
      </div>
    `;
  }
  
  private _renderResults() {
    if (!this.results) {
      return html`<empty-state></empty-state>`;
    }
    
    switch (this.viewMode) {
      case 'table':
        return html`<results-table .result=${this.results}></results-table>`;
      case 'cards':
        return html`<results-cards .result=${this.results}></results-cards>`;
      case 'json':
        return html`<results-json .result=${this.results}></results-json>`;
    }
  }
  
  private async _onRun() {
    this.status = 'running';
    
    try {
      const result = await invoke('db_execute_query', {
        connectionId: this.activeConnectionId,
        query: this.sql,
        projectPath: this.projectPath,
      });
      
      this.results = result;
      this.status = 'complete';
      
      // Auto-save to workspace
      this._autoSave();
    } catch (error) {
      this.status = 'error';
      this.lastError = error.message;
    }
  }
  
  private _autoSave() {
    // Save to session queries.json
    invoke('db_save_query', {
      projectPath: this.projectPath,
      query: {
        id: crypto.randomUUID(),
        title: 'Untitled Query',
        sql: this.sql,
        connectionId: this.activeConnectionId,
        lastRun: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
  }
}
```

---

## SOLID Principles Applied

### Single Responsibility

| File | Responsibility |
|------|----------------|
| `sql-editor.ts` | CodeMirror wrapper only |
| `results-cards.ts` | Card rendering only |
| `results-table.ts` | Table rendering only |
| `view-toggle.ts` | View mode switching only |
| `queries-store.ts` | Persistence logic only |
| `query-executor.rs` | Query execution only |

### Open/Closed

- New view modes (table/cards/json) are separate components
- New database providers implement `DatabaseProvider` trait
- Query execution is abstracted behind `QueryExecutor`

### Liskov Substitution

- `AnyPool` union type allows swapping Postgres/MySQL pools
- All view components implement same interface

### Interface Segregation

- Small, focused interfaces for each component
- No god objects or monolithic services

### Dependency Inversion

- Frontend depends on Tauri commands (abstraction), not direct DB calls
- Backend executor depends on pool interface, not concrete connections

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Run query |
| `Ctrl+S` | Save query |
| `Ctrl+L` | Focus editor |
| `Ctrl+1/2/3` | Switch view mode |
| `Escape` | Cancel running query |

---

## Data Flow

```
User types SQL
     ↓
[sql-editor] emits @run event
     ↓
[query-editor] calls Tauri command
     ↓
db_execute_query (Rust)
     ↓
QueryExecutor executes via sqlx
     ↓
Results streamed back via channel
     ↓
[query-editor] updates state
     ↓
[results-cards] re-renders
     ↓
Auto-save to queries.json
```

---

## Performance Considerations

1. **Virtual scrolling** for card grid (render only visible cards)
2. **Chunked streaming** (100 rows per batch)
3. **Debounced auto-save** (500ms after last edit)
4. **Connection pooling** (reuse pools, don't recreate)
5. **Signal-based reactivity** (fine-grained updates)

---

## Testing Strategy

```typescript
// Unit tests for components
describe('<query-card>', () => {
  it('renders record fields correctly');
  it('handles NULL values');
  it('truncates long values');
});

// Integration tests for Rust backend
#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn test_postgres_query_execution();
    
    #[tokio::test]
    async fn test_mysql_query_execution();
    
    #[test]
    fn test_queries_workspace_save_load();
}
```

---

## Migration Path

1. **Phase 1:** Create basic `query-editor` container with static editor
2. **Phase 2:** Wire up CodeMirror 6 with syntax highlighting
3. **Phase 3:** Implement Rust query executor for Postgres/MySQL
4. **Phase 4:** Connect frontend to backend, test execution
5. **Phase 5:** Add results cards component
6. **Phase 6:** Implement workspace persistence
7. **Phase 7:** Add view toggles (table/json)
8. **Phase 8:** Polish UX, keyboard shortcuts, error handling
