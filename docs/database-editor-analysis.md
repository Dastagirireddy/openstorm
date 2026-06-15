# Database Editor Analysis for OpenStorm IDE

**Research Date:** May 2026  
**Purpose:** Evaluate database editor UI patterns for OpenStorm's multi-database support (PostgreSQL, MySQL, SQLite)

---

## Executive Summary

After analyzing modern database editors (Neo4j Browser, DataGrip, DBeaver, pgconsole, TablePro), this document presents **three recommended UI patterns** for OpenStorm, with a **hybrid approach** as the primary recommendation.

### Key Findings

| Pattern | Best For | Complexity | Recommendation |
|---------|----------|------------|----------------|
| **Traditional (IntelliJ-style)** | SQL-heavy workflows, power users | Low | ✅ Secondary view |
| **Neo4j Graph + Card** | Visual exploration, relationships | High | ❌ Not primary focus |
| **Hybrid Split-Pane** | Multi-database, flexible workflows | Medium | ✅ **PRIMARY** |

---

## 1. Traditional Approach: IntelliJ/DataGrip Style

### Layout Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  [Database Tree] │  SQL Query Editor                            │
│                  │  ┌────────────────────────────────────────┐  │
│  ┌─ Schemas      │  │  SELECT * FROM users                   │  │
│  ├─ public       │  │  WHERE created_at > '2025-01-01'       │  │
│  │  ├─ tables    │  │                                        │  │
│  │  │  ├─ users ◄├──│  [▶ Run] [⏱ History] [📋 Format]       │  │
│  │  │  ├─ orders  │  └────────────────────────────────────────┘  │
│  │  │  └─ products│  ┌────────────────────────────────────────┐  │
│  │  ├─ views     │  │  Results (42 rows • 23ms)               │  │
│  │  └─ functions │  │  ┌────┬──────────┬──────────────┬─────┐ │  │
│  └─ functions    │  │  │ PK │ id       │ name         │ ... │ │  │
│                  │  │  ├────┼──────────┼──────────────┼─────┤ │  │
│  [Connections]   │  │  │ 🔑 │ 1        │ John Doe     │ ... │ │  │
│  ├─ 🟢 PostgreSQL│  │  │ 🔑 │ 2        │ Jane Smith   │ ... │ │  │
│  ├─ ⚪ MySQL     │  │  │ 🔑 │ 3        │ Bob Wilson   │ ... │ │  │
│  └─ ⚪ SQLite    │  │  │    │ ...      │ ...          │ ... │ │  │
│                  │  │  └────┴──────────┴──────────────┴─────┘ │  │
│                  │  │  [◀] [1-50 of 42] [▶]  [⬇ CSV] [⬇ JSON] │  │
│                  │  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Characteristics

| Aspect | Details |
|--------|---------|
| **Layout** | Vertical split: Editor top, Results bottom |
| **Results** | Tabular grid with pagination |
| **Navigation** | Tree-based schema browser |
| **Editing** | Inline cell editing with type-aware controls |
| **Multiple Results** | Tabs or stacked vertically |

### Pros

- ✅ Familiar to SQL developers (DataGrip, DBeaver, SSMS)
- ✅ Efficient for complex queries and large result sets
- ✅ Easy to implement with existing grid components
- ✅ Supports comparison workflows (multiple results visible)
- ✅ Research shows **41.7% prefer tables** for data tasks [^1]

### Cons

- ❌ Poor for exploring relationships
- ❌ Wide tables require horizontal scrolling
- ❌ Less intuitive for non-technical users
- ❌ Document/JSON data looks cramped

### Best Use Cases

- Traditional SQL development
- Data analysis with large result sets
- Bulk operations and data editing
- Financial/enterprise applications

---

## 2. Neo4j-Style: Graph Visualization + Card View

### Layout Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  [Query Editor - Full Width]                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  MATCH (u:User)-[:ORDERED]->(o:Order)                      │ │
│  │  WHERE u.created_at > '2025-01-01'                         │ │
│  │  RETURN u, o LIMIT 50                                      │ │
│  │                          [▶ Run] [🎨 Styles] [📊 Toggle]   │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│  [Graph View]                        │  [Card/Detail Panel]     │
│  ┌────────────────────────────────┐  │  ┌────────────────────┐ │
│  │     (User:3)                   │  │  │ 📄 User: John Doe  │ │
│  │        ╲                       │  │  ├────────────────────┤ │
│  │         [:ORDERED]             │  │  │ id: 1              │ │
│  │          ╲                     │  │  │ email: john@...    │ │
│  │      (Order:78)                │  │  │ created: 2025-...  │ │
│  │                                │  │  │                    │ │
│  │  [Zoom: 75%] [📷 PNG]          │  │  │ 📄 Related Orders  │ │
│  │                                │  │  │ ├─ Order #1001     │ │
│  │  Node Styles:                  │  │  │ ├─ Order #1005     │ │
│  │  🔵 User  🟢 Order             │  │  │ └─ Order #1012     │ │
│  └────────────────────────────────┘  │  └────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Characteristics

| Aspect | Details |
|--------|---------|
| **Layout** | Editor top, Graph + Cards split below |
| **Results** | Interactive node-link diagram |
| **Styling** | CSS-like GraSS language for node/relationship styles |
| **Interaction** | Click to expand, drag nodes, right-click context |
| **Detail View** | Card panel showing selected node properties |

### Neo4j Browser Features [^2]

**Result Frame Types:**
1. **Graph** - Node-link visualization
2. **Table** - Traditional grid view
3. **RAW** - Request/response JSON
4. **Plan** - Query execution plan

**Styling System (GraSS):**
```css
node.User {
  color: #DA7194;
  size: 30px;
  caption: "{name}";
}
relationship.ORDERED {
  width: 5px;
  caption: "{count}";
  color: #959AA1;
}
```

### Pros

- ✅ Excellent for relationship exploration
- ✅ Intuitive for visual learners
- ✅ Reveals hidden patterns in data
- ✅ Engaging for demos and discovery

### Cons

- ❌ **Hairball problem** - becomes unreadable with many nodes [^3]
- ❌ **Starburst problem** - highly connected nodes create visual chaos
- ❌ Performance degrades with 100+ nodes
- ❌ Not suitable for traditional SQL tabular data
- ❌ Requires significant engineering effort (layout algorithms, interaction)
- ❌ Only 21.97% prefer text/graph over tables for analysis [^1]

### Best Use Cases

- Graph database exploration (Neo4j, Amazon Neptune)
- Relationship visualization (foreign keys, dependencies)
- Data discovery and debugging
- Educational/demonstration contexts

---

## 3. Recommended: Hybrid Split-Pane Approach

### Layout Diagram (Primary Recommendation)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Toolbar: [◀ Schema] [▶ Query] [⚙ Settings] [🔗 Connections]        │
├──────────────┬──────────────────────────────────────────┬───────────┤
│              │                                          │           │
│  DATABASE    │              QUERY EDITOR               │  RESULTS  │
│  TREE        │                                          │  PANEL    │
│              │  ┌────────────────────────────────────┐  │           │
│  ┌─ 🟢 PG    │  │  SELECT u.id, u.name, COUNT(o.id) │  │  ┌─────┐  │
│  │  ┌─public│  │  FROM users u                      │  │  │Table│  │
│  │  │ ├─📄users│ │  LEFT JOIN orders o ON u.id = o.user_id  │  ├─────┤  │
│  │  │ ├─📄orders││  GROUP BY u.id, u.name           │  │  │ id│name│  │
│  │  │ └─📄products││  HAVING COUNT(o.id) > 5        │  │  ├───┼──────┤  │
│  │  └─┌─views  │  │                                │  │  │ 1 │John │  │
│  ├─ ⚪ MySQL  │  │  [▶ Run] [⏱] [📋] [❌ Clear]    │  │  │ 2 │Jane │  │
│  │  └─...     │  └────────────────────────────────────┘  │  │...│ ... │  │
│  └─ ⚪ SQLite │                                          │  └─────┘  │
│              │  ┌────────────────────────────────────┐  │  ┌─────┐  │
│  [Favorites] │  │  [Results: 156 rows • 45ms]       │  │  │Card │  │
│  ⭐ users    │  │                                   │  │  ├─────┤  │
│  ⭐ orders   │  │  View Toggle: [📊 Table] [🃏 Card]│  │  │ ┌────────┐│
│              │  │                                   │  │  │ │👤 John ││
│  [History]   │  │  ┌──────────────────────────────┐ │  │  │ │  12 orders│
│  10:42 AM    │  │  │id │name      │order_count   │ │  │  │ └────────┘│
│  SELECT...   │  │  ├───┼──────────┼──────────────┤ │  │  │ ┌────────┐│
│  10:40 AM    │  │  │1  │John Doe  │12            │ │  │  │ │👤 Jane ││
│  UPDATE...   │  │  │2  │Jane Smith│8             │ │  │  │ │  8 orders│
│              │  │  └──────────────────────────────┘ │  │  │ └────────┘│
│              │  │  [◀ 1-50] [50▶] [⬇ CSV] [⬇ JSON] │  │  └─────┘  │
│              │  └────────────────────────────────────┘  │           │
└──────────────┴──────────────────────────────────────────┴───────────┘
```

### Key Features

| Feature | Implementation |
|---------|----------------|
| **Three-Pane Layout** | Database Tree | Editor | Results ( resizable ) |
| **View Toggle** | Table ↔ Card switch for results |
| **Collapsible Panes** | Each pane can be hidden/maximized |
| **Multiple Results** | Tabs in results panel |
| **Query History** | Sidebar section with re-run capability |
| **Favorites** | Quick access to frequently used tables |

### Why This Approach?

1. **Flexibility** - Users choose their preferred view per task
2. **Familiarity** - Matches established IDE patterns
3. **Extensibility** - Can add graph view later for specific databases
4. **Performance** - Table view handles large datasets efficiently
5. **Research-Backed** - 41.7% prefer tables, but offering cards respects user choice [^1]

---

## 4. Detailed Component Specifications

### 4.1 Query Editor Component

```
┌─────────────────────────────────────────────────────────────┐
│  users.sql                         [📋 Format] [⚙ Settings] │
├─────────────────────────────────────────────────────────────┤
│  1  SELECT u.id, u.name, o.total                            │
│  2  FROM users u                                            │
│  3  JOIN orders o ON u.id = o.user_id                       │
│  4  WHERE u.created_at > :start_date    ← Parameter hint   │
│  5    AND o.status = 'completed'                            │
│  6  ORDER BY o.total DESC                                   │
│  7  LIMIT 100;                                              │
│                                                             │
│  [💡 AI: Add GROUP BY for aggregation] ← AI suggestion     │
└─────────────────────────────────────────────────────────────┘
```

**Requirements:**
- Syntax highlighting (Tree-sitter or CodeMirror 6)
- Schema-aware autocomplete (tables, columns, functions)
- Parameter support (`:param_name` syntax)
- Multi-statement execution
- Query formatting
- Error highlighting with inline messages
- AI assistant integration (optional future)

### 4.2 Table Results Grid

```
┌─────────────────────────────────────────────────────────────────┐
│  Results: 1,247 rows • 89ms                    [⬇ CSV] [⬇ JSON] │
├─────────────────────────────────────────────────────────────────┤
│  [+] [∅] [✎]  │  Filter: [id > 100 AND status = 'active'] [🔍] │
├────┬──────────┬───────────────┬────────────────┬───────────────┤
│ ☐  │ id (PK)  │ name          │ email          │ created_at    │
├────┼──────────┼───────────────┼────────────────┼───────────────┤
│ ☐  │ 1        │ John Doe      │ john@example.. │ 2025-01-15    │
│    │          │               │                │               │
│ ☐  │ 2        │ Jane Smith    │ [NULL]         │ 2025-01-16    │
│    │          │               │                │               │
│ ☐  │ 3        │ Bob Wilson    │ bob@...        │ 2025-01-17    │
├────┴──────────┴───────────────┴────────────────┴───────────────┤
│  [◀ Prev]  Page 1 of 25  [Next ▶]  │  Rows per page: [50 ▼]   │
└─────────────────────────────────────────────────────────────────┘
```

**Features:**
- Virtual scrolling for 100K+ rows
- Column resizing and reordering
- Click header to sort (asc → desc → none)
- Inline cell editing (double-click)
- NULL vs empty distinction (grey badge)
- Row selection with checkboxes
- Bulk actions (delete, export)
- Pagination with configurable page size
- Export: CSV, JSON, Markdown, SQL

### 4.3 Card Results View

```
┌─────────────────────────────────────────────────────────────────┐
│  Results: 1,247 rows • 89ms                    [⬇ CSV] [⬇ JSON] │
├─────────────────────────────────────────────────────────────────┤
│  View: [📊 Table] [🃏 Card]  │  Cards per row: [3 ▼]           │
├─────────────────┬─────────────────┬─────────────────────────────┤
│  ┌─────────────┐│  ┌─────────────┐│  ┌─────────────────────────┐│
│  │ 👤 John Doe ││  │ 👤 Jane     ││  │ 👤 Bob Wilson           ││
│  │             ││  │ Smith       ││  │                         ││
│  │ id: 1       ││  │ id: 2       ││  │ id: 3                   ││
│  │ email:      ││  │ email:      ││  │ email: bob@...          ││
│  │ john@...    ││  │ [NULL]      ││  │ created: 2025-01-17     ││
│  │ created:    ││  │ created:    ││  │                         ││
│  │ 2025-01-15  ││  │ 2025-01-16  ││  │ [✎ Edit] [🗑 Delete]    ││
│  │             ││  │             ││  └─────────────────────────┘│
│  │ [✎ Edit]    ││  │ [✎ Edit]    ││                             │
│  │ [🗑 Delete] ││  │ [🗑 Delete] ││                             │
│  └─────────────┘│  └─────────────┘│                             │
├─────────────────┴─────────────────┴─────────────────────────────┤
│  [◀ Prev]  Page 1 of 25  [Next ▶]  │  Showing 1-75 of 1,247    │
└─────────────────────────────────────────────────────────────────┘
```

**When to Use Cards:**
- Viewing individual records in detail
- Records with images or rich content
- When attributes vary significantly in length
- Mobile-responsive layouts (future)

### 4.4 Database Tree Navigation

```
┌─────────────────────────────┐
│  🔍 Filter tables...        │
├─────────────────────────────┤
│  ┌─ 🟢 PostgreSQL (local)   │
│  │  ┌─ 📦 public           │
│  │  │  ├─ 📄 users         │
│  │  │  │   ├─ 🔑 id        │
│  │  │  │   ├─ text name    │
│  │  │  │   └─ 🔗 order_id  │
│  │  │  ├─ 📄 orders        │
│  │  │  ├─ 📄 products      │
│  │  │  ├─ 📊 view_active_users│
│  │  │  ├─ ⚡ fn_get_user() │
│  │  │  └─ 🔖 idx_users_email│
│  │  └─ 📦 other_schema     │
│  ├─ ⚪ MySQL (production)   │
│  │  └─ ...                 │
│  └─ 🟤 SQLite (local.db)    │
│     └─ ...                 │
├─────────────────────────────┤
│  ⭐ Favorites               │
│  ├─ 📄 public.users         │
│  └─ 📄 public.orders        │
├─────────────────────────────┤
│  📜 History                 │
│  ├─ 10:42 SELECT * FROM... │
│  └─ 10:40 UPDATE users...  │
└─────────────────────────────┘
```

---

## 5. Implementation Recommendations for OpenStorm

### Phase 1: Core Foundation (MVP)

```
Priority: HIGH
┌─────────────────────────────────────────────────────────────┐
│ 1. Database Connection Manager                               │
│    - PostgreSQL, MySQL, SQLite support                       │
│    - Connection tree in sidebar                              │
│    - Basic CRUD operations                                   │
├─────────────────────────────────────────────────────────────┤
│ 2. SQL Query Editor                                          │
│    - CodeMirror 6 with syntax highlighting                   │
│    - Basic autocomplete (table names)                        │
│    - Execute query, show results in table                    │
├─────────────────────────────────────────────────────────────┤
│ 3. Results Table Grid                                        │
│    - Virtual scrolling                                       │
│    - Column resize/sort                                      │
│    - Basic pagination                                        │
│    - CSV export                                              │
└─────────────────────────────────────────────────────────────┘
```

### Phase 2: Enhanced UX

```
Priority: MEDIUM
┌─────────────────────────────────────────────────────────────┐
│ 4. Advanced Editor Features                                  │
│    - Schema-aware autocomplete                               │
│    - Query formatting                                        │
│    - Parameter support (:param)                              │
│    - Query history with re-run                               │
├─────────────────────────────────────────────────────────────┤
│ 5. Results Grid Enhancements                                 │
│    - Inline editing                                          │
│    - NULL handling                                           │
│    - Multiple result tabs                                    │
│    - JSON/Markdown export                                    │
├─────────────────────────────────────────────────────────────┤
│ 6. Card View Toggle                                          │
│    - Switch between table/card views                         │
│    - Configurable cards per row                              │
│    - Detail panel on row click                               │
└─────────────────────────────────────────────────────────────┘
```

### Phase 3: Advanced Features (Future)

```
Priority: LOW (Evaluate based on user feedback)
┌─────────────────────────────────────────────────────────────┐
│ 7. Visual Schema Tools                                       │
│    - ER diagram viewer                                       │
│    - Table relationship visualization                        │
│    - Schema diff                                             │
├─────────────────────────────────────────────────────────────┤
│ 8. Graph Visualization (Neo4j-style)                         │
│    - Only if graph database support added                    │
│    - Or for foreign key relationship exploration             │
├─────────────────────────────────────────────────────────────┤
│ 9. AI Assistant                                              │
│    - Natural language to SQL                                 │
│    - Query optimization suggestions                          │
│    - Error explanation                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Technical Architecture

### Frontend Component Structure

```
src/
├── components/
│   ├── database/
│   │   ├── database-panel.ts      # Main container
│   │   ├── database-tree.ts       # Connection/schema tree
│   │   ├── sql-editor.ts          # CodeMirror-based editor
│   │   ├── results-grid.ts        # Table view
│   │   ├── results-cards.ts       # Card view
│   │   ├── results-panel.ts       # Tab container for results
│   │   ├── query-history.ts       # History sidebar
│   │   └── connection-manager.ts  # Connection dialog
│   └── ...
```

### Rust Backend Structure

```
src-tauri/src/
├── database/
│   ├── mod.rs                    # Module entry
│   ├── connection.rs             # Connection pooling
│   ├── introspection/
│   │   ├── mod.rs               # Schema introspection
│   │   ├── postgres.rs          # PostgreSQL-specific
│   │   ├── mysql.rs             # MySQL-specific
│   │   └── sqlite.rs            # SQLite-specific
│   ├── query.rs                 # Query execution
│   └── models.rs                # Data structures
```

### State Management

```
┌─────────────────────────────────────────────────────────────┐
│                      Signal Store                            │
├─────────────────────────────────────────────────────────────┤
│  connections: DatabaseConnection[]                          │
│  activeConnection: string | null                             │
│  schemas: Record<string, Schema>                            │
│  queryHistory: QueryRecord[]                                │
│  activeQueries: Map<string, QueryState>                     │
│  results: Map<string, QueryResult>                          │
│  viewPreference: 'table' | 'card'                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Comparison Matrix

| Feature | Traditional (DataGrip) | Neo4j Graph | Hybrid (Recommended) |
|---------|----------------------|-------------|---------------------|
| **Learning Curve** | Low (familiar) | Medium | Low |
| **Implementation Effort** | Low | High | Medium |
| **SQL Workflows** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Relationship Exploration** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Large Result Sets** | ⭐⭐⭐⭐⭐ | ⭐ | ⭐⭐⭐⭐⭐ |
| **Visual Appeal** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **User Flexibility** | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Mobile Responsive** | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ (cards) |

---

## 8. Research Citations

[^1]: **Table vs Card Preference Study** - 50,000 response study (arXiv, Feb 2025) found 41.7% prefer tables, 36.2% charts, 21.97% text. Decision-makers prefer tables (51.9%), while analysts prefer charts (38.7%). [Source](https://arxiv.org/html/2411.07451)

[^2]: **Neo4j Browser Documentation** - Graph visualization with GraSS styling, multiple result frames (graph, table, raw, plan). [Source](https://neo4j.com/docs/browser/operations/result-frames/)

[^3]: **Graph Visualization UX Best Practices** - Hairball, snowstorm, and starburst problems; Shneiderman's mantra (overview first, zoom/filter, details on demand). [Source](https://www.experoinc.com/insights/blog/minding-the-sharp-edges-ux-considerations-with-graph-data-part-1-the-design-challenges-and-opportunities-of-graph-data)

**Additional Sources:**
- [DataGrip 2025.3 New UI](https://www.jetbrains.com/help/datagrip/2025.3/new-ui.html)
- [DBeaver 25.0 Release Notes](https://dbeaver.com/dbeaver-enterprise-25-0)
- [Cards vs Tables UX Research](https://bootcamp.uxdesign.cc/when-to-use-which-component-a-case-study-of-card-view-vs-table-view-7f5a6cff557b)
- [QueryArk - Multi-database IDE](https://queryark.com/)

---

## 9. Final Recommendation

### Adopt the **Hybrid Split-Pane Approach** with:

1. **Default to Table View** - Research-backed preference for database work
2. **Offer Card Toggle** - User choice for different tasks
3. **Collapsible Panes** - Flexibility for focus modes
4. **Defer Graph Visualization** - High effort, niche use case
5. **Plan for ER Diagrams** - Phase 3 feature for relationship visualization

### Rationale

This approach balances:
- **Familiarity** for power users (DataGrip/DBeaver patterns)
- **Flexibility** for different workflows (table vs card)
- **Feasibility** (incremental implementation)
- **Future-proofing** (extensible for graph/ER views)

---

*Document generated for OpenStorm IDE database editor planning.*
