# ralph-mem Architecture

> A persistent context management plugin for Claude Code

**[한국어 버전 (Korean)](./ARCHITECTURE.ko.md)**

## Overview

ralph-mem is a plugin composed of three layers:

1. **Core Layer**: Memory storage/retrieval infrastructure
2. **Hook Layer**: Automatic context injection/recording
3. **Feature Layer**: Ralph Loop iterative execution engine

```mermaid
flowchart TB
    subgraph Feature["Feature Layer"]
        direction LR
        Loop[Ralph Loop Engine]
        Criteria[Success Criteria]
        Snapshot[File Snapshot]
    end

    subgraph Hook["Hook Layer"]
        direction LR
        Start[SessionStart]
        Submit[UserPromptSubmit]
        Tool[PostToolUse]
        End[SessionEnd]
    end

    subgraph Core["Core Layer"]
        direction LR
        Store[Memory Store]
        Search[Search Engine]
        Compress[Compressor]
        Embed[Embedding Service]
    end

    subgraph Skills["Skills"]
        direction LR
        Ralph[/ralph]
        MemSearch[/mem-search]
        MemStatus[/mem-status]
        MemInject[/mem-inject]
        MemForget[/mem-forget]
    end

    Feature --> Core
    Hook --> Core
    Skills --> Core
    Skills --> Feature
    Core --> DB[(SQLite + FTS5)]
```

## Directory Structure

```text
src/
├── index.ts                    # Plugin entry point
├── core/                       # Core Layer
│   ├── store.ts               # Memory Store (session/observation CRUD)
│   ├── search.ts              # Search Engine (FTS5)
│   ├── compressor.ts          # Context Compressor
│   ├── embedding.ts           # Embedding Service
│   └── db/
│       ├── client.ts          # DB client
│       ├── schema.ts          # Schema definition
│       ├── paths.ts           # Path utilities
│       ├── types.ts           # Type definitions
│       └── migrations/        # Migrations
├── hooks/                      # Hook Layer
│   ├── session-start.ts       # Session start hook
│   ├── session-end.ts         # Session end hook
│   ├── post-tool-use.ts       # Post tool use hook
│   └── user-prompt-submit.ts  # Prompt submit hook
├── features/ralph/             # Feature Layer
│   ├── engine.ts              # Loop engine
│   ├── criteria.ts            # Success criteria evaluation
│   ├── stop-conditions.ts     # Stop conditions
│   └── snapshot.ts            # File snapshot/rollback
├── skills/                     # Slash Commands
│   ├── ralph.ts               # /ralph start|stop|status
│   ├── ralph-config.ts        # /ralph config
│   ├── mem-search.ts          # /mem-search
│   ├── mem-status.ts          # /mem-status
│   ├── mem-inject.ts          # /mem-inject
│   └── mem-forget.ts          # /mem-forget
└── utils/
    ├── config.ts              # Config system
    ├── tokens.ts              # Token calculation
    └── errors.ts              # Error handling
```

## Core Layer

### Memory Store

Manages the lifecycle of sessions and observations.

```mermaid
classDiagram
    class MemoryStore {
        +createSession(projectPath)
        +endSession(sessionId, summary)
        +getSession(sessionId)
        +listSessions(projectPath)
        +close()
    }

    class DBClient {
        +createObservation(data)
        +getObservations(sessionId)
        +deleteObservation(id)
        +createLoopRun(data)
        +updateLoopRun(id, data)
    }

    MemoryStore --> DBClient
```

**Key Types:**

```typescript
interface Session {
  id: string;           // "sess-xxx"
  project_path: string;
  started_at: Date;
  ended_at?: Date;
  summary?: string;
}

interface Observation {
  id: string;           // "obs-xxx"
  session_id: string;
  type: "tool_use" | "error" | "success" | "note";
  content: string;
  tool_name?: string;
  created_at: Date;
}
```

### Search Engine

Provides FTS5-based full-text search.

```mermaid
flowchart LR
    Query[Search Query] --> Tokenize[Tokenize]
    Tokenize --> FTS5[FTS5 Match]
    FTS5 --> Rank[BM25 Ranking]
    Rank --> Layer{Layer?}
    Layer -->|1| Index[ID + Score]
    Layer -->|2| Timeline[Chronological Context]
    Layer -->|3| Full[Full Content]
```

**Progressive Disclosure:**

| Layer | Tokens | Content |
|-------|--------|---------|
| 1 | 50-100 | ID, score, summary |
| 2 | 200-300 | Chronological context |
| 3 | 500-1000 | Full content + code |

### Compressor

Performs context compression and summarization.

```typescript
interface CompressorConfig {
  maxTokens: number;      // Maximum tokens
  preserveTypes: string[]; // Types to preserve (error, success)
}

function compressContext(observations: Observation[], config: CompressorConfig): string;
```

### Embedding Service

Provides vector embeddings for semantic search.

```typescript
interface EmbeddingService {
  embed(text: string): Promise<number[]>;
  similarity(a: number[], b: number[]): number;
}
```

## Hook Layer

Automatically responds to Claude Code events.

```mermaid
sequenceDiagram
    participant CC as Claude Code
    participant H as Hook Layer
    participant C as Core Layer

    CC->>H: SessionStart
    H->>C: createSession()
    C-->>H: Previous session context
    H-->>CC: Injected context

    CC->>H: UserPromptSubmit
    H->>C: search(prompt)
    C-->>H: Related memory
    H-->>CC: Enhanced prompt

    CC->>H: PostToolUse
    H->>C: createObservation()

    CC->>H: SessionEnd
    H->>C: endSession(summary)
```

### Hook Details

| Hook | Trigger | Action |
|------|---------|--------|
| SessionStart | Session start | Create session, inject previous context |
| UserPromptSubmit | Before prompt submission | Search and inject related memory |
| PostToolUse | After tool use | Record result as observation |
| SessionEnd | Session end | Generate and save summary |

## Feature Layer (Ralph Loop)

Iteratively executes until goal is achieved.

```mermaid
flowchart TB
    Start[/ralph start goal/] --> Init[Initialize]
    Init --> Snapshot[File Snapshot]
    Snapshot --> Execute[Execute]
    Execute --> Check{Success Criteria?}
    Check -->|Pass| Success[Complete]
    Check -->|Fail| Stop{Stop Condition?}
    Stop -->|Yes| Fail[Failed]
    Stop -->|No| Execute
    Fail --> Rollback{Rollback?}
    Rollback -->|Yes| Restore[Restore]
    Rollback -->|No| End[End]
```

### Success Criteria

```typescript
type CriteriaType =
  | "test_pass"      // Tests pass
  | "build_success"  // Build succeeds
  | "lint_clean"     // No lint errors
  | "type_check"     // Type check passes
  | "custom"         // User-defined
  | "marker";        // Output marker

interface SuccessCriteria {
  type: CriteriaType;
  command?: string;
  expected?: string | number;
}
```

### Stop Conditions

```typescript
interface StopConditions {
  maxIterations: number;       // Maximum iterations (default: 10)
  maxDuration: number;         // Maximum execution time (ms)
  noProgressThreshold: number; // No-progress threshold
}
```

### File Snapshot

```mermaid
flowchart LR
    Start[Loop Start] --> Snapshot[Create Snapshot]
    Snapshot --> Store[(Storage)]
    Execute[Execute] --> Check{Success?}
    Check -->|Failure| Rollback[Rollback Option]
    Rollback --> Restore[Restore Snapshot]
```

## Skills (Slash Commands)

| Command | Description |
|---------|-------------|
| `/ralph start <goal>` | Start Loop |
| `/ralph stop [--rollback]` | Stop Loop |
| `/ralph status` | Check status |
| `/ralph config [key] [value]` | View/modify config |
| `/mem-search <query> [--layer N]` | Search memory |
| `/mem-status` | Check memory usage |
| `/mem-inject <content>` | Manual memory injection |
| `/mem-forget <id> [--confirm]` | Delete memory |

## Data Flow

### Normal Session

```mermaid
sequenceDiagram
    participant U as User
    participant H as Hooks
    participant C as Core
    participant DB as SQLite

    U->>H: Start session
    H->>C: createSession()
    C->>DB: INSERT sessions
    C->>DB: SELECT observations (previous)
    DB-->>C: Previous context
    C-->>H: Injection context
    H-->>U: Session ready

    U->>H: Enter prompt
    H->>C: search(prompt)
    C->>DB: FTS5 MATCH
    DB-->>C: Related observations
    C-->>H: Search results
    H-->>U: Enhanced prompt

    Note over U: Claude performs task

    U->>H: Tool use complete
    H->>C: createObservation()
    C->>DB: INSERT observations
    C->>DB: INSERT observations_fts
```

### Ralph Loop

```mermaid
sequenceDiagram
    participant U as User
    participant R as Ralph
    participant H as Hooks
    participant C as Core

    U->>R: /ralph start "goal"
    R->>C: createLoopRun()
    R->>R: File snapshot

    loop Each Iteration
        R->>H: Generate prompt
        H->>C: Search context
        C-->>H: Include previous results
        H-->>R: Enhanced prompt
        R->>R: Execute Agent
        R->>H: PostToolUse
        H->>C: Save results
        R->>R: Check success criteria
    end

    R->>C: updateLoopRun(complete)
    R-->>U: Return results
```

## Storage Structure

```text
~/.config/ralph-mem/           # Global config
├── config.yaml               # Global settings
└── memory.db                 # Global memory DB

<project>/.ralph-mem/          # Per-project
├── config.yaml               # Project settings (override)
└── memory.db                 # Project memory DB
```

### DB Schema

```mermaid
erDiagram
    sessions ||--o{ observations : has
    sessions ||--o{ loop_runs : has

    sessions {
        text id PK
        text project_path
        datetime started_at
        datetime ended_at
        text summary
    }

    observations {
        text id PK
        text session_id FK
        text type
        text content
        text tool_name
        text metadata
        datetime created_at
    }

    loop_runs {
        text id PK
        text session_id FK
        text goal
        integer iterations
        text status
        text snapshot_id
        datetime started_at
        datetime ended_at
    }

    observations_fts {
        text content
    }
```

## Config System

```yaml
# config.yaml
memory:
  max_observations: 1000
  retention_days: 30
  auto_compress: true

search:
  default_layer: 2
  max_results: 10

ralph:
  max_iterations: 10
  cooldown_ms: 1000
  auto_rollback: false
  success_criteria:
    - type: test_pass
    - type: build_success
```

**Priority**: Project settings > Global settings > Defaults

## Error Handling

```mermaid
flowchart TB
    Error[Error Occurred] --> Level{Severity?}
    Level -->|Low| Log[Log Only]
    Level -->|Medium| Notify[User Notification]
    Level -->|High| Recover[Attempt Recovery]
    Recover --> Options{Recovery Options}
    Options --> Retry[Retry]
    Options --> Fallback[Fallback]
    Options --> Skip[Skip]
```

| Severity | Example | Handling |
|----------|---------|----------|
| Low | Cache miss | Log and continue |
| Medium | DB query failure | Notify user, fallback |
| High | DB corruption | Present recovery options |

## Performance Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Search response (1000 obs) | < 200ms | ~0.6ms |
| Hook overhead | < 50ms | ~9ms |
| Session start | < 500ms | ~1ms |
| DB size (1000 sessions) | < 100MB | ~60MB |

## Tech Stack

| Category | Technology | Reason |
|----------|------------|--------|
| Runtime | Bun | Fast startup, built-in SQLite |
| Language | TypeScript | Type safety |
| Database | SQLite + FTS5 | Local, full-text search |
| Testing | Bun Test | Bun compatible, fast execution |

## Related Documents

- [PRD](PRD.md) - Product Requirements Document
- [Design Docs](design/README.md) - Detailed Design
- [Issues](issues/README.md) - Implementation Tasks
