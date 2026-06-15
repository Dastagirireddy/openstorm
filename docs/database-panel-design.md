# Database Panel - ASCII Design

## Overview

The Database Panel provides an IntelliJ-style database explorer with a multi-column tree view for managing database connections and browsing schema objects.

---

## Full Panel Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  DATABASE                                                               + ─│ │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                            ╭╮│
│  ▼ 🐘 postgres_main              POSTGRESQL                                ││
│    ════════════════════════════════════════════════════════════════════════││
│                                                                            ││
│    ▼ 📦 public                                                             ││
│                                                                            ││
│      ▼ 📋 users                                        1,234 rows          ││
│                                                                            ││
│        🔑 id                       INT             PK, NN                  ││
│        📝 username                 VARCHAR(50)     NN, UQ                  ││
│        📧 email                    VARCHAR(100)    NN                      ││
│        🔒 password_hash            VARCHAR(255)    NN                      ││
│        📅 created_at               TIMESTAMP       NN                      ││
│        📅 updated_at               TIMESTAMP                               ││
│                                                                            ││
│      ▼ 📋 posts                                        5,678 rows          ││
│                                                                            ││
│        🔑 id                       INT             PK, NN                  ││
│        🔑 user_id                  INT             PK, NN, FK              ││
│        📝 title                    VARCHAR(200)    NN                      ││
│        📄 content                  TEXT                                    ││
│        📅 published_at             TIMESTAMP                               ││
│                                                                            ││
│      ▶ 📋 comments                                                         ││
│      ▶ 📋 tags                                                             ││
│      ▶ 📋 post_tags                                                        ││
│                                                                            ││
│    ▼ 📦 other_schema                                                       ││
│                                                                            ││
│      ▶ 📋 audit_log                                                        ││
│                                                                            ││
│    ▶ 📦 information_schema                                                 ││
│                                                                            ││
│  ▼ 🐬 mysql_legacy               MYSQL                                     ││
│    ════════════════════════════════════════════════════════════════════════││
│                                                                            ││
│    ▶ 📦 app_database                                                       ││
│                                                                            ││
│  ▶ 🪨 sqlite_local               SQLITE                                    ││
│  ▶ 🍃 mongodb_docs               MONGODB                                   ││
│  ▶ 🔴 redis_cache                REDIS                                     ││
│                                                                            ││
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Header Toolbar

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  DATABASE                                                               + ─│ │
└──────────────────────────────────────────────────────────────────────────────┘
     │                                │                                 │   │
     │                                │                                 │   └─ Minimize/Maximize
     │                                │                                 └───── Add Connection
     │                                └─────────────────────────────────────── Spacer
     └───────────────────────────────────────────────────────────────────────── Brand Indicator + Title
```

---

## Connection Row (Expanded)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ▼ 🐘 postgres_main              POSTGRESQL                                │ │
│  │  │                              │                                         │
│  │  │                              └────────────── Database Type Badge      │
│  │  └───────────────────────────────────────────── Connection Name          │
│  │                                                                        │
│  └── Expand/Collapse + Database Vendor Icon                                │
│                                                                              │
│  ═══════════════════════════════════════════════════════════════════════════ │
│  │                                                                          │
│  └── Colored accent bar (vendor-specific gradient)                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Schema Row

```
┌──────────────────────────────────────────────────────────────────────────────┐
│    ▼ 📦 public                                                               │ │
│    │  │                                                                      │
│    │  └───────────────────────────────────────────────── Schema Name         │
│    │                                                                         │
│    └── Expand/Collapse + Schema Icon                                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Table Row (with row count)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│      ▼ 📋 users                                        1,234 rows          │ │
│      │  │                                              │                     │
│      │  │                                              └── Row Count        │
│      │  └────────────────────────────────────────────── Table Name          │
│      │                                                                      │
│      └── Expand/Collapse + Table Icon                                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Column Row (with type and constraints)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│        🔑 id                       INT             PK, NN                  │ │
│        │                           │               │                         │
│        │                           │               └── Constraints          │
│        │                           └─────────────────── Data Type (mono)   │
│        └────────────────────────────────────────────── Column Name          │
│                                                                              │
│        📝 username                 VARCHAR(50)     NN, UQ                  │ │
│        📧 email                    VARCHAR(100)    NN                      │ │
│        🔒 password_hash            VARCHAR(255)    NN                      │ │
│        📅 created_at               TIMESTAMP       NN                      │ │
│        📅 updated_at               TIMESTAMP                               │ │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Column Icons Legend

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Icon    Meaning              Shown When                                     │
│  ─────────────────────────────────────────────────────────────────────────── │
│  🔑      Primary Key          Column is part of primary key                 │
│  🔒      Foreign Key          Column references another table               │
│  📝      Text Column          VARCHAR, CHAR, TEXT types                     │
│  📧      Email Column         Detected email field                          │
│  📅      Date/Time Column     TIMESTAMP, DATE, DATETIME types               │
│  🔢      Numeric Column       INT, BIGINT, DECIMAL types                    │
│  📄      Large Text           TEXT, BLOB, CLOB types                        │
│  🏷️      Tag/Label            Boolean or flag column                        │
│  🔗      Link/Reference       URL or reference column                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Constraint Badges

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Badge   Meaning              Description                                    │
│  ─────────────────────────────────────────────────────────────────────────── │
│  PK      Primary Key          Column is part of primary key                 │
│  NN      Not Null             Column cannot be NULL                         │
│  UQ      Unique               Column values must be unique                  │
│  FK      Foreign Key          Column references another table               │
│  AI      Auto Increment       Column auto-generates values                  │
│  DEF     Default              Column has a default value                     │
│  IDX     Indexed              Column has an index                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Collapsed State

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  DATABASE                                                               + ─│ │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                            ╭╮│
│  ▶ 🐘 postgres_main              POSTGRESQL                                ││
│  ═══════════════════════════════════════════════════════════════════════════││
│                                                                            ││
│  ▶ 🐬 mysql_legacy               MYSQL                                     ││
│  ═══════════════════════════════════════════════════════════════════════════││
│                                                                            ││
│  ▶ 🪨 sqlite_local               SQLITE                                    ││
│  ═══════════════════════════════════════════════════════════════════════════││
│                                                                            ││
│  ▶ 🍃 mongodb_docs               MONGODB                                   ││
│  ═══════════════════════════════════════════════════════════════════════════││
│                                                                            ││
│  ▶ 🔴 redis_cache                REDIS                                     ││
│  ═══════════════════════════════════════════════════════════════════════════││
│                                                                            ││
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Loading State

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  DATABASE                                                               + ─│ │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                            ╭╮│
│  ⟳  postgres_main              POSTGRESQL         Connecting...          ││
│    ════════════════════════════════════════════════════════════════════════││
│                                                                            ││
│  ▶ 🐬 mysql_legacy               MYSQL                                     ││
│                                                                            ││
└──────────────────────────────────────────────────────────────────────────────┘
     │
     └── Spinning loader icon indicates connection in progress
```

---

## Empty State (No Connections)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  DATABASE                                                               + ─│ │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                          ┌──────────────────────┐                           │
│                          │                      │                           │
│                          │   🗄️                 │                           │
│                          │                      │                           │
│                          │  No database         │                           │
│                          │  connections         │                           │
│                          │                      │                           │
│                          │  Click + to add a    │                           │
│                          │  connection          │                           │
│                          │                      │                           │
│                          └──────────────────────┘                           │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Hover State

```
┌──────────────────────────────────────────────────────────────────────────────┐
│      ▼ 📋 users                                        1,234 rows     [🗑️] │ │
│      │  │                                              │               │     │
│      │  │                                              │               └─ Delete│
│      │  │                                              └── Row Count          │
│      │  └────────────────────────────────────────────── Table Name            │
│      │                                                                       │
│      └── Expand/Collapse + Table Icon                                       │
│                                                                              │
│      ═══════════════════════════════════════════════════════════════════════ │
│      │←──────────────────────────────────────────────────────────────────→│  │
│      │                                                                    │  │
│      └─── Highlight background (hover state)                              │  │
│                                                                           │  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Selected State

```
┌──────────────────────────────────────────────────────────────────────────────┐
│        🔑 id                       INT             PK, NN                  │ │
│        ════════════════════════════════════════════════════════════════════ │ │
│        │←────────────────────────────────────────────────────────────────→│ │
│        │                                                                  │ │
│        └── Selected background (darker/highlighted)                       │ │
│                                                                            │ │
│        📝 username                 VARCHAR(50)     NN, UQ                  │ │
│        📧 email                    VARCHAR(100)    NN                      │ │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Context Menu (Right-Click)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│      ▼ 📋 users                                        1,234 rows          │ │
│      ═══════════════════════════════════════════════════════════════════════ │ │
│                                                                              │ │
│      ┌─────────────────────────────────────────────────────────────────┐    │ │
│      │ 🔍 View Top 100 Rows                                     Ctrl+E │    │ │
│      │ 📊 View All Rows                                                │    │ │
│      │ 🔎 Filter Rows...                                               │    │ │
│      ├─────────────────────────────────────────────────────────────────┤    │ │
│      │ 📝 Modify Table                                                 │    │ │
│      │ 📋 Copy Table Name                                              │    │ │
│      │ 📤 Export Data...                                               │    │ │
│      ├─────────────────────────────────────────────────────────────────┤    │ │
│      │ 🗑️ Drop Table...                                                │    │ │
│      └─────────────────────────────────────────────────────────────────┘    │ │
│                                                                              │ │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Connection Color Coding

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Database        Accent Gradient      Border           Icon Color           │
│  ─────────────────────────────────────────────────────────────────────────── │
│  PostgreSQL      Cyan → Blue          Cyan/25          #336791              │
│  MySQL           Orange → Amber       Orange/25        #F29111              │
│  SQLite          Teal → Emerald       Teal/25          #003B57              │
│  MongoDB         Green → Emerald      Green/25         #47A248              │
│  Redis           Red → Rose           Red/25           #DC382D              │
│  MariaDB         Sky → Blue           Sky/25           #003545              │
│  SQL Server      Red → Rose           Red/25           #CC2927              │
│  Oracle          Red → Orange         Red/25           #F80000              │
│  CockroachDB     Violet → Purple      Violet/25        #6935FF              │
│  ClickHouse      Orange → Amber       Orange/25        #FF6600              │
│  Neo4j           Blue → Indigo        Blue/25          #018BFF              │
│  Elasticsearch   Sky → Cyan           Sky/25           #005571              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Tree Indentation Levels

```
Level 0: Connection     (0px indent)   ▼ 🐘 postgres_main
Level 1: Schema         (16px indent)    ▼ 📦 public
Level 2: Table/View     (32px indent)      ▼ 📋 users
Level 3: Column         (48px indent)        🔑 id
```

---

## Component Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ <data-sources-panel>                                                        │
│ │                                                                           │
│ │ ┌───────────────────────────────────────────────────────────────────────┐ │
│ │ │ Header Toolbar                                                        │ │
│ │ │ • Brand indicator                                                     │ │
│ │ │ • Title "DATABASE"                                                    │ │
│ │ │ • Add connection button (+)                                           │ │
│ │ └───────────────────────────────────────────────────────────────────────┘ │
│ │                                                                           │
│ │ ┌───────────────────────────────────────────────────────────────────────┐ │
│ │ │ <database-multi-tree>                                                 │ │
│ │ │ │                                                                     │ │
│ │ │ │ For each connection:                                                │ │
│ │ │ │ ┌─────────────────────────────────────────────────────────────────┐│ │
│ │ │ │ │ Connection Row (expandable)                                     ││ │
│ │ │ │ │ • Expand/collapse chevron                                       ││ │
│ │ │ │ │ • Database vendor icon                                          ││ │
│ │ │ │ │ • Connection name                                               ││ │
│ │ │ │ │ • Type badge                                                    ││ │
│ │ │ │ └─────────────────────────────────────────────────────────────────┘│ │
│ │ │ │ │                                                                 │ │
│ │ │ │ │ For each child (schema/table/view):                             │ │
│ │ │ │ │ ┌─────────────────────────────────────────────────────────────┐││ │
│ │ │ │ │ │ Tree Node Row                                               ││ │
│ │ │ │ │ │ • Expand/collapse chevron                                   ││ │
│ │ │ │ │ │ • Object icon                                               ││ │
│ │ │ │ │ │ • Object name                                               ││ │
│ │ │ │ │ │ • Info (row count, constraints, etc.)                       ││ │
│ │ │ │ │ └─────────────────────────────────────────────────────────────┘││ │
│ │ │ │                                                                 │ │
│ │ │ └─────────────────────────────────────────────────────────────────┘ │
│ │                                                                       │
│ └───────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Interaction States

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  Default:      No background, standard text                                 │
│  ────────────────────────────────────────────────────────────────────────── │
│                                                                              │
│  Hover:        Light background highlight                                   │
│  ────────────────────────────────────────────────────────────────────────── │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│                                                                              │
│  Selected:     Stronger background highlight                                │
│  ────────────────────────────────────────────────────────────────────────── │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
│                                                                              │
│  Loading:      Spinner icon, disabled interactions                          │
│  ────────────────────────────────────────────────────────────────────────── │
│  ⟳ Connecting...                                                            │
│                                                                              │
│  Error:        Red tint, error icon                                         │
│  ────────────────────────────────────────────────────────────────────────── │ │
│  ⚠️ Connection failed: timeout                                              │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Keyboard Navigation

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Key              Action                                                    │
│  ─────────────────────────────────────────────────────────────────────────── │
│  ↑/↓              Navigate up/down in tree                                  │
│  →                Expand collapsed node / Enter child level                 │
│  ←                Collapse expanded node / Go to parent                     │
│  Enter            Toggle expand/collapse                                    │
│  Space            Select/deselect node                                      │
│  F2               Rename selected object                                    │
│  Delete           Delete selected connection/table                          │
│  F5               Refresh connection                                        │
│  Ctrl+E           View top 100 rows (on table)                              │
│  Ctrl+F           Filter rows (on table)                                    │
│  Ctrl+C           Copy selected value/name                                  │
│  Ctrl+A           Select all (in results)                                   │
│  Escape           Close context menu / Clear selection                      │
└──────────────────────────────────────────────────────────────────────────────┘
```
