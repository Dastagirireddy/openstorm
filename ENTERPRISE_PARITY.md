# Enterprise AI CLI Feature Parity

## Comparison Matrix

| Feature | OpenStorm | Claude Code | GitHub Copilot CLI | Cursor | Aider |
|---------|-----------|-------------|-------------------|--------|-------|
| **Providers** | | | | | |
| Ollama (local) | ✅ | ❌ | ❌ | ❌ | ✅ |
| LM Studio (local) | ✅ | ❌ | ❌ | ❌ | ✅ |
| OpenAI API | ❌ | ❌ | ✅ | ✅ | ✅ |
| Anthropic API | ❌ | ✅ | ❌ | ✅ | ✅ |
| Azure OpenAI | ❌ | ❌ | ✅ | ✅ | ❌ |
| Google Gemini | ❌ | ❌ | ❌ | ✅ | ✅ |
| AWS Bedrock | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Streaming** | | | | | |
| Token-by-token | ❌ | ✅ | ✅ | ✅ | ✅ |
| Tool call streaming | ❌ | ✅ | ✅ | ✅ | ❌ |
| **Context** | | | | | |
| Context window mgmt | ✅ | ✅ | ✅ | ✅ | ✅ |
| File attachments | ❌ | ✅ | ✅ | ✅ | ✅ |
| @ mentions | ❌ | ✅ | ✅ | ✅ | ✅ |
| Image input | ❌ | ✅ | ❌ | ✅ | ❌ |
| **Tools** | | | | | |
| Read/write files | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit specific lines | ✅ | ✅ | ✅ | ✅ | ✅ |
| Search code | ✅ | ✅ | ✅ | ✅ | ✅ |
| Run commands | ✅ | ✅ | ✅ | ✅ | ✅ |
| Git integration | ✅ | ✅ | ✅ | ✅ | ✅ |
| LSP diagnostics | ✅ | ❌ | ❌ | ✅ | ❌ |
| Browser/web | ❌ | ✅ | ❌ | ❌ | ❌ |
| MCP tools | ❌ | ✅ | ❌ | ❌ | ❌ |
| Custom tools | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Agent** | | | | | |
| Multi-step planning | ✅ | ✅ | ✅ | ✅ | ✅ |
| Sub-agents | ❌ | ✅ | ❌ | ❌ | ❌ |
| Background tasks | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Memory** | | | | | |
| Session memory | ✅ | ✅ | ✅ | ✅ | ✅ |
| Project memory | ✅ | ✅ | ❌ | ✅ | ✅ |
| Cross-project | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Safety** | | | | | |
| Tool approval | ✅ | ✅ | ✅ | ✅ | ✅ |
| Sandbox | ✅ | ✅ | ❌ | ❌ | ❌ |
| Permission profiles | ✅ | ❌ | ❌ | ❌ | ❌ |
| Audit logging | ❌ | ✅ | ❌ | ❌ | ❌ |
| **UX** | | | | | |
| Diff preview | ✅ | ✅ | ✅ | ✅ | ✅ |
| Undo/rollback | ❌ | ✅ | ❌ | ✅ | ✅ |
| Cost tracking | ❌ | ✅ | ✅ | ✅ | ✅ |
| Conversation export | ❌ | ✅ | ❌ | ✅ | ✅ |

---

## Missing Features (Priority Order)

### P0 - Critical (Must Have)

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 1 | **Streaming responses** | 2-3 days | UX critical - users expect real-time tokens |
| 2 | **OpenAI/Anthropic providers** | 3-5 days | Users can't use paid APIs |
| 3 | **File attachments** | 1-2 days | Can't send specific files as context |
| 4 | **@ mentions** | 1-2 days | Can't reference files inline |
| 5 | **Cost/token tracking** | 1 day | Users don't know API costs |

### P1 - Important (Should Have)

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 6 | **MCP (Model Context Protocol)** | 5-7 days | Industry standard for tool extensibility |
| 7 | **Custom tools/scripts** | 3-5 days | Users can add their own tools |
| 8 | **Sub-agents** | 5-7 days | Parallel task execution |
| 9 | **Undo/rollback** | 2-3 days | Safety net for file changes |
| 10 | **Audit logging** | 2-3 days | Enterprise compliance |

### P2 - Nice to Have

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 11 | **Git PR creation** | 2-3 days | Workflow automation |
| 12 | **Test generation** | 3-5 days | Productivity boost |
| 13 | **Doc generation** | 2-3 days | Documentation automation |
| 14 | **Code review** | 5-7 days | Quality improvement |
| 15 | **Browser/web tools** | 5-7 days | Web research capability |

---

## What's Implemented (Our Agent Runtime)

### ✅ Done
- Context window management (token trimming)
- Permission system (4 profiles)
- Sandbox (resource limits)
- Verification engine (syntax checks)
- Memory store (working + project)
- RAG search (BM25 keyword)
- 16 tools (read, write, edit, search, git, etc.)
- Tool approval flow
- Failure tracking (stops infinite loops)

### 🔧 In Progress
- Streaming (non-streaming works)
- Multi-provider (Ollama, LM Studio only)

---

## Implementation Roadmap

### Phase 1: Core Gaps (2 weeks)
```
Week 1: Streaming + OpenAI/Anthropic providers
Week 2: File attachments + @ mentions + cost tracking
```

### Phase 2: Enterprise Features (3 weeks)
```
Week 3: MCP protocol + custom tools
Week 4: Sub-agents + undo/rollback
Week 5: Audit logging + conversation export
```

### Phase 3: Advanced (4 weeks)
```
Week 6-7: Git PR + test generation
Week 8-9: Code review + doc generation
```

---

## Key Differentiators (What We Have That Others Don't)

| Feature | Why It Matters |
|---------|---------------|
| **Permission profiles** | Fine-grained control (Full/ReadOnly/Guided/Smart) |
| **Built-in sandbox** | Resource limits on command execution |
| **Verification engine** | Auto-checks syntax after writes |
| **RAG without API** | Local keyword search, no embedding costs |
| **Failure tracking** | Stops infinite loops automatically |
| **Tauri native** | Fast, native desktop app (not Electron) |

---

## Cost Comparison

| Provider | Cost per 1M tokens | Our Support |
|----------|-------------------|-------------|
| Ollama (local) | Free | ✅ |
| LM Studio (local) | Free | ✅ |
| OpenAI GPT-4o | $2.50/$10 | ❌ Need to add |
| Anthropic Claude | $3/$15 | ❌ Need to add |
| Azure OpenAI | Variable | ❌ Need to add |

---

*Last updated: 2026-06-19*
