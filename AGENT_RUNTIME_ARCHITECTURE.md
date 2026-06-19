# Agent Runtime Architecture

## Executive Summary

This document defines the missing runtime infrastructure to transform OpenStorm's AI panel from a chat-with-tools interface into a true agentic coding system. The current implementation (agent.rs, tools.rs) provides a solid foundation but lacks the autonomous decision-making, context management, and safety layers required for production agentic AI.

---

## 1. Current State Assessment

### What Exists
| Component | Location | Status |
|-----------|----------|--------|
| Agent loop | `src-tauri/src/ai/agent.rs:141-380` | Basic iterative loop (max 10 iterations) |
| Tool registry | `src-tauri/src/ai/tools.rs` | 6 tools (read, write, list, search, run, git) |
| Tool approval | `agent.rs:250-294` | mpsc channel for write_file, run_command |
| Provider system | `src-tauri/src/ai/provider.rs` | Trait-based (Ollama, LM Studio) |
| Project context | `src-tauri/src/ai/project_context.rs` | Auto-detect language/framework |
| Streaming events | `agent.rs:33-80` | AgentEvent enum to frontend |

### Critical Gaps
1. **No context window management** — sends all messages unbounded, will hit token limits
2. **No error recovery** — tool failure breaks the loop, no retry logic
3. **No memory** — each session starts fresh, no cross-session learning
4. **No concurrent execution** — tools run sequentially, blocking on I/O
5. **No verification** — writes files without checking if result is correct
6. **No streaming** — uses non-streaming `chat_completion`, poor UX for long responses
7. **No sub-agent composition** — single monolithic agent for all tasks
8. **No sandboxing** — `run_command` executes arbitrary shell commands

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                           │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  AI Panel   │  │  Terminal    │  │  Editor (CodeMirror)   │ │
│  │  (chat UI)  │  │  (xterm.js)  │  │  (diff/apply)          │ │
│  └──────┬──────┘  └──────┬───────┘  └───────────┬────────────┘ │
│         │                │                      │               │
│         └────────────────┼──────────────────────┘               │
│                          │ IPC (Tauri events)                   │
├──────────────────────────┼──────────────────────────────────────┤
│                    AGENT RUNTIME                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  Orchestrator                            │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │   │
│  │  │ Task Queue  │  │ Context Mgr │  │ Memory Store    │  │   │
│  │  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘  │   │
│  │         │                │                   │            │   │
│  │         └────────────────┼───────────────────┘            │   │
│  │                          │                                │   │
│  │  ┌───────────────────────▼────────────────────────────┐   │   │
│  │  │              Agent Loop (per task)                 │   │   │
│  │  │  ┌─────────┐  ┌──────────┐  ┌──────────────────┐  │   │   │
│  │  │  │ Planner │  │ Executor │  │ Verifier         │  │   │   │
│  │  │  └────┬────┘  └────┬─────┘  └────────┬─────────┘  │   │   │
│  │  │       │            │                  │             │   │   │
│  │  │       └────────────┼──────────────────┘             │   │   │
│  │  └────────────────────┼────────────────────────────────┘   │   │
│  └───────────────────────┼────────────────────────────────────┘   │
│                          │                                        │
├──────────────────────────┼────────────────────────────────────────┤
│                    TOOL LAYER                                     │
│  ┌──────────┐  ┌─────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Sandbox  │  │ Cache   │  │ Registry │  │ Approval Gate    │  │
│  │ (exec)   │  │ (redis) │  │ (tools)  │  │ (permissions)    │  │
│  └──────────┘  └─────────┘  └──────────┘  └──────────────────┘  │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  Tool Implementations                                      │  │
│  │  read_file │ write_file │ search │ run_command │ git │ ... │  │
│  └─────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

---

## 3. Core Components

### 3.1 Context Window Manager

**Problem**: The current agent sends all messages unbounded. With tool results (file contents, search output), the context window fills rapidly.

**Solution**: Token-aware context management with sliding window and summarization.

```rust
// src-tauri/src/ai/context.rs (NEW)

pub struct ContextManager {
    /// Maximum tokens for the context window
    max_tokens: usize,
    /// Token encoder (tiktoken or similar)
    encoder: TokenEncoder,
    /// Summary cache for old messages
    summaries: Vec<Message>,
    /// Working set (recent messages that stay in context)
    working_set: Vec<Message>,
    /// System prompt (always included)
    system_prompt: String,
}

impl ContextManager {
    /// Add a message, evicting old ones if needed
    pub fn push(&mut self, msg: Message) {
        self.working_set.push(msg);
        self.trim_to_budget();
    }

    /// Remove oldest messages until within token budget
    fn trim_to_budget(&mut self) {
        let budget = self.max_tokens - self.token_count(&self.system_prompt);
        let mut current = self.token_count_messages(&self.working_set);

        while current > budget && self.working_set.len() > 2 {
            // Evict oldest non-system message
            let evicted = self.working_set.remove(0);
            // Summarize evicted message for context
            if let Some(summary) = self.summarize(&evicted) {
                self.summaries.push(summary);
            }
            current = self.token_count_messages(&self.working_set);
        }

        // If still over budget, compress summaries
        if current > budget {
            self.compress_summaries();
        }
    }

    /// Build the final message list for the LLM
    pub fn build_messages(&self) -> Vec<Message> {
        let mut msgs = vec![Message::System {
            content: self.system_prompt.clone(),
        }];

        // Add compressed summaries as system context
        if !self.summaries.is_empty() {
            let summary_text = self.summaries.iter()
                .map(|m| m.content())
                .collect::<Vec<_>>()
                .join("\n");
            msgs.push(Message::System {
                content: format!("Previous context:\n{}", summary_text),
            });
        }

        // Add working set
        msgs.extend(self.working_set.clone());
        msgs
    }

    /// Estimate token count for a string
    fn token_count(&self, text: &str) -> usize {
        self.encoder.count(text)
    }
}
```

**Key behaviors**:
- Always keeps system prompt + last N messages
- Evicts old messages, summarizing them first
- Tool results are truncated by default (configurable)
- File contents are stored by reference (path + line range) not full copy

### 3.2 Agent Orchestrator

**Problem**: Current agent is a single loop. Complex tasks need decomposition into sub-tasks with different strategies.

**Solution**: Orchestrator that manages task queues, spawns specialized sub-agents, and coordinates results.

```rust
// src-tauri/src/ai/orchestrator.rs (NEW)

pub struct Orchestrator {
    /// Task queue (FIFO with priorities)
    task_queue: Arc<Mutex<VecDeque<Task>>>,
    /// Active agents (task_id -> agent_handle)
    active_agents: HashMap<String, AgentHandle>,
    /// Shared memory store
    memory: Arc<MemoryStore>,
    /// Tool registry (shared across agents)
    tools: Arc<ToolRegistry>,
    /// Event sender to frontend
    event_tx: mpsc::Sender<AgentEvent>,
}

pub struct Task {
    pub id: String,
    pub kind: TaskKind,
    pub priority: Priority,
    pub context: TaskContext,
    pub created_at: Instant,
}

pub enum TaskKind {
    /// Direct user request
    UserRequest(String),
    /// Sub-task spawned by an agent
    SubTask {
        parent_id: String,
        description: String,
        strategy: Strategy,
    },
    /// Verification task (check a previous action)
    Verify {
        action_id: String,
        action_type: ActionType,
    },
    /// Background task (indexing, caching)
    Background(BackgroundJob),
}

pub enum Strategy {
    /// Simple: single agent, linear execution
    Simple,
    /// Complex: decompose into sub-tasks
    Decompose,
    /// Research: read-only exploration
    Explore,
    /// Refactoring: multi-file coordinated changes
    Refactor,
}

impl Orchestrator {
    /// Process the next task in the queue
    pub async fn process_next(&self) -> Result<(), AgentError> {
        let task = self.task_queue.lock().await.pop_front()
            .ok_or(AgentError::EmptyQueue)?;

        match &task.kind {
            TaskKind::UserRequest(msg) => {
                // Classify task complexity
                let strategy = self.classify_task(msg).await;

                match strategy {
                    Strategy::Simple => {
                        // Single agent, direct execution
                        let agent = self.spawn_agent(&task).await?;
                        agent.run(msg.clone()).await?;
                    }
                    Strategy::Decompose => {
                        // Break into sub-tasks
                        let sub_tasks = self.decompose(msg).await?;
                        for sub in sub_tasks {
                            self.task_queue.lock().await.push_back(sub);
                        }
                    }
                    Strategy::Explore => {
                        // Read-only agent (no write_file, no run_command)
                        let agent = self.spawn_readonly_agent(&task).await?;
                        agent.run(msg.clone()).await?;
                    }
                    _ => {}
                }
            }
            TaskKind::SubTask { parent_id, description, strategy } => {
                // Execute sub-task with parent context
                let parent_context = self.get_parent_context(parent_id).await;
                let agent = self.spawn_agent_with_context(&task, parent_context).await?;
                agent.run(description.clone()).await?;
            }
            TaskKind::Verify { action_id, action_type } => {
                // Run verification checks
                self.verify_action(action_id, action_type).await?;
            }
            TaskKind::Background(job) => {
                // Low-priority background work
                self.run_background(job).await?;
            }
        }

        Ok(())
    }

    /// Classify a user request into a strategy
    async fn classify_task(&self, msg: &str) -> Strategy {
        // Heuristic + optional LLM classification
        let has_multi_file = msg.contains("refactor") || msg.contains("rename")
            || msg.contains("move") || msg.contains("across");
        let has_ambiguous = msg.contains("figure out") || msg.contains("figure out");

        if has_multi_file {
            Strategy::Refactor
        } else if has_ambiguous {
            Strategy::Explore
        } else {
            Strategy::Simple
        }
    }

    /// Decompose a complex task into sub-tasks
    async fn decompose(&self, msg: &str) -> Result<Vec<Task>, AgentError> {
        // Use LLM to generate a plan, then convert to tasks
        let plan = self.llm_plan(msg).await?;
        Ok(plan.steps.into_iter().enumerate().map(|(i, step)| {
            Task {
                id: format!("sub-{}-{}", i, Uuid::new_v4()),
                kind: TaskKind::SubTask {
                    parent_id: "root".to_string(),
                    description: step,
                    strategy: Strategy::Simple,
                },
                priority: Priority::Normal,
                context: TaskContext::default(),
                created_at: Instant::now(),
            }
        }).collect())
    }
}
```

### 3.3 Memory System

**Problem**: Each session starts fresh. No learning from previous interactions.

**Solution**: Persistent memory with three tiers.

```rust
// src-tauri/src/ai/memory.rs (NEW)

/// Three-tier memory system
pub struct MemoryStore {
    /// Working memory (current session only)
    working: WorkingMemory,
    /// Project memory (persisted per-project)
    project: ProjectMemory,
    /// Global memory (cross-project learnings)
    global: GlobalMemory,
}

/// Working memory: ephemeral, per-session
pub struct WorkingMemory {
    /// Current task context
    current_task: Option<String>,
    /// Recently accessed files (path -> content hash)
    file_cache: HashMap<String, u64>,
    /// Conversation summary
    summary: String,
    /// Key facts extracted from conversation
    facts: Vec<Fact>,
}

/// Project memory: persisted in .openstorm/memory.json
pub struct ProjectMemory {
    /// File index (path -> metadata)
    file_index: HashMap<String, FileMeta>,
    /// Code graph (symbol -> references)
    code_graph: CodeGraph,
    /// User preferences learned
    preferences: HashMap<String, serde_json::Value>,
    /// Successful patterns (what worked before)
    patterns: Vec<Pattern>,
    /// Failed attempts (what to avoid)
    failures: Vec<Failure>,
}

/// Global memory: persisted in ~/.openstorm/memory.json
pub struct GlobalMemory {
    /// User coding style preferences
    style: StylePreferences,
    /// Common project patterns
    common_patterns: Vec<Pattern>,
    /// Tool usage statistics
    tool_stats: HashMap<String, ToolStats>,
}

#[derive(Serialize, Deserialize)]
pub struct Fact {
    pub key: String,
    pub value: String,
    pub confidence: f32,
    pub source: String,
    pub learned_at: DateTime<Utc>,
}

#[derive(Serialize, Deserialize)]
pub struct Pattern {
    pub description: String,
    pub trigger: String,  // What context triggers this pattern
    pub action: String,   // What to do
    pub success_rate: f32,
    pub examples: Vec<String>,
}

#[derive(Serialize, Deserialize)]
pub struct Failure {
    pub description: String,
    pub context: String,
    pub error: String,
    pub avoided_count: u32,
}

impl MemoryStore {
    /// Load memory from disk
    pub async fn load(project_path: &str) -> Result<Self, MemoryError> {
        let project_mem_path = format!("{}/.openstorm/memory.json", project_path);
        let global_mem_path = dirs::home_dir()
            .map(|h| h.join(".openstorm/memory.json"))
            .ok_or(MemoryError::NoHomeDir)?;

        let project = if tokio::fs::metadata(&project_mem_path).await.is_ok() {
            let data = tokio::fs::read_to_string(&project_mem_path).await?;
            serde_json::from_str(&data)?
        } else {
            ProjectMemory::default()
        };

        let global = if tokio::fs::metadata(&global_mem_path).await.is_ok() {
            let data = tokio::fs::read_to_string(&global_mem_path).await?;
            serde_json::from_str(&data)?
        } else {
            GlobalMemory::default()
        };

        Ok(Self {
            working: WorkingMemory::new(),
            project,
            global,
        })
    }

    /// Save project memory to disk
    pub async fn save_project(&self, project_path: &str) -> Result<(), MemoryError> {
        let path = format!("{}/.openstorm/memory.json", project_path);
        let data = serde_json::to_string_pretty(&self.project)?;
        tokio::fs::create_dir_all(format!("{}/.openstorm", project_path)).await?;
        tokio::fs::write(&path, data).await?;
        Ok(())
    }

    /// Learn from a successful action
    pub fn learn_success(&mut self, context: &str, action: &str) {
        let pattern = Pattern {
            description: format!("When {}, do {}", context, action),
            trigger: context.to_string(),
            action: action.to_string(),
            success_rate: 1.0,
            examples: vec![action.to_string()],
        };
        self.project.patterns.push(pattern);
    }

    /// Learn from a failure
    pub fn learn_failure(&mut self, context: &str, error: &str) {
        let failure = Failure {
            description: format!("Failed to {} when {}", action, context),
            context: context.to_string(),
            error: error.to_string(),
            avoided_count: 0,
        };
        self.project.failures.push(failure);
    }

    /// Build memory context for system prompt
    pub fn to_prompt_section(&self) -> String {
        let mut sections = Vec::new();

        // Recent facts
        if !self.working.facts.is_empty() {
            let facts: Vec<String> = self.working.facts.iter()
                .map(|f| format!("- {}: {} (confidence: {:.0}%)", f.key, f.value, f.confidence * 100.0))
                .collect();
            sections.push(format!("Known facts:\n{}", facts.join("\n")));
        }

        // Learned patterns
        if !self.project.patterns.is_empty() {
            let patterns: Vec<String> = self.project.patterns.iter()
                .filter(|p| p.success_rate > 0.7)
                .take(5)
                .map(|p| format!("- {}", p.description))
                .collect();
            if !patterns.is_empty() {
                sections.push(format!("Learned patterns:\n{}", patterns.join("\n")));
            }
        }

        // Avoided patterns
        if !self.project.failures.is_empty() {
            let avoid: Vec<String> = self.project.failures.iter()
                .take(3)
                .map(|f| format!("- Avoid: {}", f.description))
                .collect();
            sections.push(format!("Avoid:\n{}", avoid.join("\n")));
        }

        sections.join("\n\n")
    }
}
```

### 3.4 Tool Execution Sandbox

**Problem**: `run_command` executes arbitrary shell commands with no restrictions.

**Solution**: Sandboxed execution with resource limits and approval policies.

```rust
// src-tauri/src/ai/sandbox.rs (NEW)

pub struct Sandbox {
    /// Allowed commands (regex patterns)
    allowed_commands: Vec<Regex>,
    /// Denied commands (regex patterns)
    denied_commands: Vec<Regex>,
    /// Resource limits
    limits: ResourceLimits,
    /// Approval policy
    approval_policy: ApprovalPolicy,
}

pub struct ResourceLimits {
    /// Max execution time (seconds)
    pub max_timeout: u64,
    /// Max output size (bytes)
    pub max_output: usize,
    /// Max file size for write (bytes)
    pub max_write_size: usize,
    /// Allowed file extensions for write
    pub allowed_write_extensions: Vec<String>,
    /// Denied directories (cannot write to)
    pub denied_directories: Vec<String>,
}

pub enum ApprovalPolicy {
    /// Always ask for approval
    Always,
    /// Auto-approve read-only, ask for writes
    ReadWrite,
    /// Auto-approve safe commands, ask for risky ones
    Smart,
    /// Never ask (dangerous, for trusted environments)
    Never,
}

impl Sandbox {
    /// Check if a command is allowed
    pub fn check_command(&self, command: &str) -> SandboxResult {
        // Check denied list first
        for pattern in &self.denied_commands {
            if pattern.is_match(command) {
                return SandboxResult::Denied(format!(
                    "Command matches denied pattern: {}",
                    pattern.as_str()
                ));
            }
        }

        // Check allowed list
        for pattern in &self.allowed_commands {
            if pattern.is_match(command) {
                return SandboxResult::Allowed;
            }
        }

        // Default: ask for approval
        SandboxResult::ApprovalRequired
    }

    /// Check if a file write is allowed
    pub fn check_write(&self, path: &str, content: &str) -> SandboxResult {
        // Check file extension
        if let Some(ext) = path.rsplit('.').next() {
            if !self.limits.allowed_write_extensions.contains(&ext.to_string()) {
                return SandboxResult::Denied(format!(
                    "File extension .{} not allowed for writes",
                    ext
                ));
            }
        }

        // Check file size
        if content.len() > self.limits.max_write_size {
            return SandboxResult::Denied(format!(
                "Write size {} exceeds limit {}",
                content.len(),
                self.limits.max_write_size
            ));
        }

        // Check denied directories
        for dir in &self.limits.denied_directories {
            if path.starts_with(dir) {
                return SandboxResult::Denied(format!(
                    "Cannot write to directory: {}",
                    dir
                ));
            }
        }

        SandboxResult::Allowed
    }

    /// Execute a command with resource limits
    pub async fn execute_command(
        &self,
        command: &str,
        cwd: &str,
    ) -> Result<CommandOutput, SandboxError> {
        let result = tokio::time::timeout(
            Duration::from_secs(self.limits.max_timeout),
            tokio::process::Command::new("sh")
                .args(["-c", command])
                .current_dir(cwd)
                .output(),
        ).await;

        match result {
            Ok(Ok(output)) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);

                // Truncate output
                let stdout = if stdout.len() > self.limits.max_output {
                    format!("{}... (truncated)", &stdout[..self.limits.max_output])
                } else {
                    stdout.to_string()
                };

                Ok(CommandOutput {
                    stdout,
                    stderr: stderr.to_string(),
                    exit_code: output.status.code().unwrap_or(-1),
                })
            }
            Ok(Err(e)) => Err(SandboxError::ExecutionFailed(e.to_string())),
            Err(_) => Err(SandboxError::Timeout),
        }
    }
}
```

### 3.5 Verification Engine

**Problem**: No verification after code changes. Agent writes code and moves on.

**Solution**: Post-action verification with automatic rollback.

```rust
// src-tauri/src/ai/verifier.rs (NEW)

pub struct Verifier {
    /// LSP client for type checking
    lsp: Arc<LspClient>,
    /// Project path
    project_path: String,
}

pub struct VerificationResult {
    pub passed: bool,
    pub checks: Vec<CheckResult>,
    pub suggestion: Option<String>,
}

pub struct CheckResult {
    pub name: String,
    pub passed: bool,
    pub message: String,
    pub severity: Severity,
}

impl Verifier {
    /// Verify a file write action
    pub async fn verify_write(
        &self,
        path: &str,
        content: &str,
    ) -> VerificationResult {
        let mut checks = Vec::new();

        // 1. Syntax check (compile/lint)
        if let Some(check) = self.check_syntax(path, content).await {
            checks.push(check);
        }

        // 2. Type check (if LSP available)
        if let Some(check) = self.check_types(path).await {
            checks.push(check);
        }

        // 3. Test check (if tests exist)
        if let Some(check) = self.check_tests(path).await {
            checks.push(check);
        }

        // 4. Import check (no broken imports)
        if let Some(check) = self.check_imports(path, content).await {
            checks.push(check);
        }

        let passed = checks.iter().all(|c| c.passed || c.severity != Severity::Error);

        VerificationResult {
            passed,
            checks,
            suggestion: if !passed {
                Some("Consider reverting and trying a different approach".to_string())
            } else {
                None
            },
        }
    }

    /// Verify a shell command result
    pub async fn verify_command(
        &self,
        command: &str,
        output: &CommandOutput,
    ) -> VerificationResult {
        let mut checks = Vec::new();

        // Check exit code
        checks.push(CheckResult {
            name: "exit_code".to_string(),
            passed: output.exit_code == 0,
            message: format!("Exit code: {}", output.exit_code),
            severity: if output.exit_code == 0 { Severity::Info } else { Severity::Warning },
        });

        // Check for common error patterns
        let error_patterns = ["error:", "Error:", "FAILED", "panic:", "fatal:"];
        for pattern in &error_patterns {
            if output.stderr.contains(pattern) || output.stdout.contains(pattern) {
                checks.push(CheckResult {
                    name: "error_pattern".to_string(),
                    passed: false,
                    message: format!("Found error pattern: {}", pattern),
                    severity: Severity::Error,
                });
            }
        }

        let passed = checks.iter().all(|c| c.passed || c.severity != Severity::Error);

        VerificationResult {
            passed,
            checks,
            suggestion: None,
        }
    }

    /// Check syntax by attempting to compile/lint
    async fn check_syntax(&self, path: &str, content: &str) -> Option<CheckResult> {
        let ext = path.rsplit('.').next()?;

        let (cmd, args) = match ext {
            "rs" => ("cargo", vec!["check", "--message-format=json"]),
            "ts" | "tsx" => ("npx", vec!["tsc", "--noEmit"]),
            "js" | "jsx" => ("npx", vec!["eslint", path]),
            "py" => ("python", vec!["-m", "py_compile", path]),
            _ => return None,
        };

        let output = tokio::process::Command::new(cmd)
            .args(&args)
            .current_dir(&self.project_path)
            .output()
            .await
            .ok()?;

        Some(CheckResult {
            name: "syntax".to_string(),
            passed: output.status.success(),
            message: String::from_utf8_lossy(&output.stderr).to_string(),
            severity: Severity::Error,
        })
    }
}
```

### 3.6 Streaming Agent Loop

**Problem**: Current agent uses non-streaming `chat_completion`. Long responses block.

**Solution**: Streaming with incremental token delivery.

```rust
// Modification to agent.rs

impl Agent {
    /// Run the agent loop with streaming
    pub async fn run_inner_streaming(
        &self,
        user_message: String,
        history: Vec<Message>,
        tx: &mpsc::Sender<AgentEvent>,
    ) -> Result<(), ProviderError> {
        let mut context = ContextManager::new(self.max_tokens());
        context.set_system_prompt(self.build_system_prompt());
        context.extend(history);
        context.push(Message::User { content: user_message });

        for iteration in 0..self.max_iterations {
            let messages = context.build_messages();
            let tool_defs = self.tools.definitions();

            let request = ChatCompletionRequest {
                model: self.model.clone(),
                messages,
                tools: Some(tool_defs),
                stream: Some(true),  // Enable streaming
                temperature: Some(0.7),
                max_tokens: Some(4096),
            };

            // Use streaming endpoint
            let mut stream = self.provider.chat_completion_stream(request).await?;
            let mut full_content = String::new();
            let mut tool_calls: Vec<ToolCall> = Vec::new();

            // Process stream chunks
            while let Some(chunk) = stream.recv().await {
                match chunk {
                    ChatCompletionChunk::TextDelta { content } => {
                        full_content.push_str(&content);
                        let _ = tx.send(AgentEvent::TextDelta { content }).await;
                    }
                    ChatCompletionChunk::ToolCallStart { id, name } => {
                        tool_calls.push(ToolCall {
                            id,
                            function: FunctionCall {
                                name,
                                arguments: String::new(),
                            },
                        });
                    }
                    ChatCompletionChunk::ToolCallDelta { index, arguments_delta } => {
                        if let Some(call) = tool_calls.get_mut(index) {
                            call.function.arguments.push_str(&arguments_delta);
                        }
                    }
                    ChatCompletionChunk::Done { usage } => {
                        // Stream complete
                        break;
                    }
                }
            }

            // Process completed tool calls
            if !tool_calls.is_empty() {
                context.push(Message::Assistant {
                    content: Some(full_content.clone()),
                    tool_calls: Some(tool_calls.clone()),
                });

                for call in &tool_calls {
                    let result = self.execute_tool_with_approval(call, tx).await;
                    context.push(Message::Tool {
                        tool_call_id: call.id.clone(),
                        content: result,
                    });
                }
            } else {
                // Final response (no tool calls)
                let _ = tx.send(AgentEvent::Response {
                    content: full_content,
                    tool_calls_made: iteration as u32,
                    usage: None,
                }).await;
                return Ok(());
            }
        }

        Ok(())
    }
}
```

### 3.7 Permission System

**Problem**: No granular control over what the agent can do.

**Solution**: Role-based permission system with configurable policies.

```rust
// src-tauri/src/ai/permissions.rs (NEW)

pub struct PermissionSystem {
    /// Current permission profile
    profile: PermissionProfile,
    /// Per-tool permissions
    tool_permissions: HashMap<String, ToolPermission>,
    /// User overrides
    overrides: HashMap<String, bool>,
}

pub enum PermissionProfile {
    /// Full access (dangerous, for trusted environments)
    Full,
    /// Read-only (safe, for exploration)
    ReadOnly,
    /// Guided (ask for every write/delete)
    Guided,
    /// Custom (user-defined)
    Custom(HashMap<String, ToolPermission>),
}

pub struct ToolPermission {
    pub requires_approval: bool,
    pub requires_confirmation: bool,
    pub allowed_patterns: Vec<String>,  // Regex patterns for allowed args
    pub denied_patterns: Vec<String>,   // Regex patterns for denied args
    pub rate_limit: Option<u32>,        // Max calls per minute
}

impl PermissionSystem {
    /// Check if a tool call is allowed
    pub fn check(&self, tool: &str, args: &str) -> PermissionResult {
        let perm = self.tool_permissions.get(tool)
            .cloned()
            .unwrap_or_default();

        // Check denied patterns
        for pattern in &perm.denied_patterns {
            if let Ok(re) = Regex::new(pattern) {
                if re.is_match(args) {
                    return PermissionResult::Denied(
                        format!("Argument matches denied pattern: {}", pattern)
                    );
                }
            }
        }

        // Check allowed patterns
        if !perm.allowed_patterns.is_empty() {
            let any_allowed = perm.allowed_patterns.iter().any(|pattern| {
                Regex::new(pattern).map(|re| re.is_match(args)).unwrap_or(false)
            });
            if !any_allowed {
                return PermissionResult::Denied(
                    "Argument doesn't match any allowed pattern".to_string()
                );
            }
        }

        // Check approval requirement
        if perm.requires_approval {
            return PermissionResult::ApprovalRequired;
        }

        PermissionResult::Allowed
    }

    /// Get the default permission profile
    pub fn default_profile() -> Self {
        let mut tool_permissions = HashMap::new();

        // Read tools: always allowed
        tool_permissions.insert("read_file".to_string(), ToolPermission {
            requires_approval: false,
            requires_confirmation: false,
            allowed_patterns: vec![".*".to_string()],
            denied_patterns: vec![],
            rate_limit: None,
        });

        tool_permissions.insert("list_directory".to_string(), ToolPermission {
            requires_approval: false,
            requires_confirmation: false,
            allowed_patterns: vec![".*".to_string()],
            denied_patterns: vec![],
            rate_limit: None,
        });

        tool_permissions.insert("search_code".to_string(), ToolPermission {
            requires_approval: false,
            requires_confirmation: false,
            allowed_patterns: vec![".*".to_string()],
            denied_patterns: vec![],
            rate_limit: None,
        });

        // Write tools: require approval
        tool_permissions.insert("write_file".to_string(), ToolPermission {
            requires_approval: true,
            requires_confirmation: false,
            allowed_patterns: vec![],
            denied_patterns: vec![
                r"^\..*".to_string(),  // No dotfiles
                r".*\.lock$".to_string(),  // No lock files
            ],
            rate_limit: Some(10),
        });

        // Command execution: require approval + confirmation
        tool_permissions.insert("run_command".to_string(), ToolPermission {
            requires_approval: true,
            requires_confirmation: true,
            allowed_patterns: vec![],
            denied_patterns: vec![
                r"rm\s+-rf\s+/".to_string(),  // No rm -rf /
                r"sudo\s+".to_string(),  // No sudo
                r"curl\s+.*\|\s*sh".to_string(),  // No pipe to sh
            ],
            rate_limit: Some(5),
        });

        Self {
            profile: PermissionProfile::Guided,
            tool_permissions,
            overrides: HashMap::new(),
        }
    }
}
```

---

## 4. New Tools for Agentic Coding

### 4.1 Code Intelligence Tools

```rust
// Add to tools.rs

ToolDefinition {
    tool_type: "function".to_string(),
    function: FunctionDefinition {
        name: "find_references".to_string(),
        description: "Find all references to a symbol in the codebase".to_string(),
        parameters: serde_json::json!({
            "type": "object",
            "properties": {
                "symbol": {
                    "type": "string",
                    "description": "The symbol name to find references for"
                },
                "kind": {
                    "type": "string",
                    "enum": ["function", "type", "variable", "module"],
                    "description": "The kind of symbol"
                }
            },
            "required": ["symbol"]
        }),
    },
},

ToolDefinition {
    tool_type: "function".to_string(),
    function: FunctionDefinition {
        name: "get_definition".to_string(),
        description: "Get the definition of a symbol".to_string(),
        parameters: serde_json::json!({
            "type": "object",
            "properties": {
                "symbol": {
                    "type": "string",
                    "description": "The symbol name"
                },
                "file": {
                    "type": "string",
                    "description": "Optional file hint"
                }
            },
            "required": ["symbol"]
        }),
    },
},

ToolDefinition {
    tool_type: "function".to_string(),
    function: FunctionDefinition {
        name: "run_tests".to_string(),
        description: "Run tests for a file or the entire project".to_string(),
        parameters: serde_json::json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Optional file/directory to test"
                },
                "filter": {
                    "type": "string",
                    "description": "Optional test name filter"
                }
            },
            "required": []
        }),
    },
},

ToolDefinition {
    tool_type: "function".to_string(),
    function: FunctionDefinition {
        name: "get_diagnostics".to_string(),
        description: "Get LSP diagnostics (errors, warnings) for a file".to_string(),
        parameters: serde_json::json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "File path to check"
                }
            },
            "required": ["path"]
        }),
    },
},

ToolDefinition {
    tool_type: "function".to_string(),
    function: FunctionDefinition {
        name: "git_diff".to_string(),
        description: "Show git diff for changes".to_string(),
        parameters: serde_json::json!({
            "type": "object",
            "properties": {
                "staged": {
                    "type": "boolean",
                    "description": "Show staged changes"
                },
                "file": {
                    "type": "string",
                    "description": "Optional specific file"
                }
            },
            "required": []
        }),
    },
},

ToolDefinition {
    tool_type: "function".to_string(),
    function: FunctionDefinition {
        name: "git_commit".to_string(),
        description: "Create a git commit".to_string(),
        parameters: serde_json::json!({
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": "Commit message"
                },
                "files": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Optional list of files to stage"
                }
            },
            "required": ["message"]
        }),
    },
},

ToolDefinition {
    tool_type: "function".to_string(),
    function: FunctionDefinition {
        name: "edit_file".to_string(),
        description: "Edit a file by replacing specific lines (safer than write_file)".to_string(),
        parameters: serde_json::json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "File path"
                },
                "start_line": {
                    "type": "integer",
                    "description": "Start line (1-indexed)"
                },
                "end_line": {
                    "type": "integer",
                    "description": "End line (1-indexed, inclusive)"
                },
                "new_content": {
                    "type": "string",
                    "description": "Replacement content"
                }
            },
            "required": ["path", "start_line", "end_line", "new_content"]
        }),
    },
},
```

---

## 5. System Prompt Enhancements

```rust
fn build_system_prompt(&self) -> String {
    let project_section = self.project_context.to_prompt_section();
    let memory_section = self.memory.to_prompt_section();
    let permissions_section = self.permissions.to_prompt_section();

    format!(
        r#"You are an AI coding assistant embedded in the OpenStorm IDE.
You have access to tools that let you read, write, and search files in the user's project.

{project_section}

{memory_section}

{permissions_section}

## Capabilities

You can:
- Read and analyze code
- Write and edit files
- Search codebases
- Run shell commands
- Execute tests
- Check git status and create commits
- Find code references and definitions

## Decision Framework

1. **Understand first**: Before making changes, read relevant files and understand the context
2. **Plan before acting**: For complex tasks, output a numbered plan
3. **Minimize changes**: Make the smallest change that solves the problem
4. **Verify your work**: After making changes, check for errors
5. **Explain your reasoning**: Tell the user what you're doing and why

## Error Handling

- If a tool fails, try a different approach
- If you're unsure, ask the user
- If a change might break things, warn the user first
- Never silently fail

## Safety

- Don't modify files outside the project directory
- Don't run destructive commands without confirmation
- Don't expose secrets or credentials
- Don't commit without user approval

Available tools:
- read_file: Read a file's contents
- write_file: Write content to a file (creates/overwrites)
- edit_file: Edit specific lines in a file (safer than write_file)
- list_directory: List files in a directory
- search_code: Search for patterns in code
- find_references: Find all references to a symbol
- get_definition: Get the definition of a symbol
- run_command: Execute a shell command
- run_tests: Run tests for a file or project
- get_diagnostics: Get LSP diagnostics for a file
- git_status: Get current git status
- git_diff: Show git diff
- git_commit: Create a git commit"#
    )
}
```

---

## 6. Event System Enhancements

```rust
// Extended AgentEvent enum

pub enum AgentEvent {
    // Existing events...

    /// Context window status
    #[serde(rename = "context_status")]
    ContextStatus {
        tokens_used: usize,
        tokens_max: usize,
        messages_pruned: usize,
    },

    /// Verification result
    #[serde(rename = "verification")]
    Verification {
        passed: bool,
        checks: Vec<CheckResult>,
    },

    /// Memory update
    #[serde(rename = "memory_update")]
    MemoryUpdate {
        kind: String,  // "pattern_learned", "failure_recorded", etc.
        summary: String,
    },

    /// Sub-task spawned
    #[serde(rename = "sub_task_spawned")]
    SubTaskSpawned {
        task_id: String,
        description: String,
    },

    /// Sub-task completed
    #[serde(rename = "sub_task_completed")]
    SubTaskCompleted {
        task_id: String,
        result: String,
    },

    /// Permission request
    #[serde(rename = "permission_request")]
    PermissionRequest {
        tool: String,
        args: String,
        reason: String,
    },

    /// Permission granted/denied
    #[serde(rename = "permission_response")]
    PermissionResponse {
        tool: String,
        granted: bool,
    },
}
```

---

## 7. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Context window manager (token counting, trimming)
- [ ] Enhanced streaming support
- [ ] Tool result truncation strategies
- [ ] Basic error recovery (retry on transient failures)

### Phase 2: Safety (Week 3-4)
- [ ] Sandbox for command execution
- [ ] Permission system with profiles
- [ ] File write restrictions (extensions, sizes, directories)
- [ ] Approval flow enhancements (batch approvals, "always allow" option)

### Phase 3: Intelligence (Week 5-6)
- [ ] LSP integration tools (references, definitions, diagnostics)
- [ ] Test runner integration
- [ ] Git integration tools (diff, commit, branch)
- [ ] Code graph building (AST, imports, symbols)

### Phase 4: Memory (Week 7-8)
- [ ] Project memory persistence
- [ ] Pattern learning (success/failure tracking)
- [ ] User preference learning
- [ ] Cross-session memory

### Phase 5: Orchestration (Week 9-10)
- [ ] Task decomposition
- [ ] Sub-agent spawning
- [ ] Concurrent tool execution
- [ ] Verification engine

### Phase 6: Polish (Week 11-12)
- [ ] Frontend UX for new features
- [ ] Performance optimization
- [ ] Testing and bug fixes
- [ ] Documentation

---

## 8. Configuration

```json
// .openstorm/config.json
{
  "agent": {
    "max_iterations": 15,
    "max_tokens": 8192,
    "temperature": 0.7,
    "streaming": true,
    "verification": {
      "enabled": true,
      "auto_rollback": true,
      "checks": ["syntax", "types", "tests", "imports"]
    },
    "memory": {
      "enabled": true,
      "project_memory": true,
      "global_memory": true,
      "max_patterns": 100,
      "max_failures": 50
    },
    "sandbox": {
      "enabled": true,
      "timeout": 30,
      "max_output": 10000,
      "allowed_commands": [".*"],
      "denied_commands": [
        "rm\\s+-rf\\s+/",
        "sudo\\s+.*",
        "curl.*\\|\\s*sh"
      ]
    },
    "permissions": {
      "profile": "guided",
      "auto_approve_reads": true,
      "batch_approvals": true,
      "remember_choices": true
    }
  }
}
```

---

## 9. Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Task completion rate | ~60% | >90% |
| Context window utilization | Unbounded | <80% avg |
| Tool failure recovery | None | 80% auto-recover |
| Verification pass rate | N/A | >95% |
| Memory recall accuracy | N/A | >70% relevance |
| User intervention rate | Every action | <20% of actions |
| Response latency (P95) | 5-10s | <3s first token |

---

## 10. Migration Strategy

1. **Backward compatible**: New features are opt-in via config
2. **Gradual rollout**: Enable features one at a time
3. **Fallback**: If new system fails, fall back to current behavior
4. **Testing**: Unit tests for each component, integration tests for the full loop

---

*Document version: 1.0*
*Last updated: 2026-06-19*
