# Error Handling

> Error handling strategy

**[한국어 버전 (Korean)](./error-handling.ko.md)**

## Error Severity

### 3-Level Classification

| Level | Severity | Example | Action |
|-------|----------|---------|--------|
| Low | Low | Embedding generation failure | Log only, continue |
| Medium | Medium | FTS5 search failure | Try fallback, then notify |
| High | High | DB connection failure | Immediate notification, user choice |

### Level-based Handling

```typescript
type ErrorLevel = 'low' | 'medium' | 'high';

interface ErrorHandler {
  level: ErrorLevel;
  handle(error: Error): Promise<ErrorResult>;
}

// Low: Log only
const lowHandler: ErrorHandler = {
  level: 'low',
  async handle(error) {
    logger.warn('Non-critical error', { error });
    return { action: 'continue' };
  }
};

// Medium: Try fallback
const mediumHandler: ErrorHandler = {
  level: 'medium',
  async handle(error) {
    logger.error('Recoverable error', { error });
    const fallback = await tryFallback(error);
    if (fallback.success) {
      return { action: 'continue', result: fallback.result };
    }
    await notify(`⚠️ ${error.message} (fallback failed)`);
    return { action: 'continue_degraded' };
  }
};

// High: User choice
const highHandler: ErrorHandler = {
  level: 'high',
  async handle(error) {
    logger.error('Critical error', { error });
    const choice = await askUser({
      message: `❌ ${error.message}`,
      options: ['Retry', 'Continue without', 'Abort']
    });
    return { action: choice };
  }
};
```

## Graceful Degradation

### User Choice Based

Provide user choice on severe errors:

```
❌ Database connection failed

Options:
  [1] Retry
  [2] Continue without memory features
  [3] Abort session

Selection: _
```

### Feature-specific Fallback

| Feature | Error | Fallback Action |
|---------|-------|-----------------|
| Embedding generation | Model load failure | Use FTS5 only |
| FTS5 search | Index corruption | Full scan |
| DB write | Disk full | Store in memory queue |
| Session summary | Claude API failure | Skip manual summary |

### Fallback Notification

```
⚠️ Embedding model load failed
└─ Fallback: Using FTS5 full-text search only.
   Semantic-based search will be limited.
```

## Logging

### Logging Levels

| Level | Content | Default Enabled |
|-------|---------|-----------------|
| Debug | Detailed debugging info | ❌ |
| Info | General operation info | ✅ |
| Warn | Warnings (Low errors) | ✅ |
| Error | Errors (Medium/High) | ✅ |

### Log Location

```
~/.config/ralph-mem/logs/
├── ralph-mem.log      # Current log
└── ralph-mem.1.log    # Rotated log
```

### Log Format

```
[2025-01-15T10:30:00.000Z] [INFO] Session started: sess-abc123
[2025-01-15T10:30:01.000Z] [WARN] Embedding generation slow: 2500ms
[2025-01-15T10:30:05.000Z] [ERROR] FTS5 search failed: SQLITE_CORRUPT
```

## Ralph Loop Errors

### Test Execution Failure

```typescript
async function runTest(command: string): Promise<TestResult> {
  try {
    const output = await exec(command);
    return { success: true, output };
  } catch (error) {
    // Test failure is not an error (normal flow)
    if (error.code === 1) {
      return { success: false, output: error.stdout };
    }
    // Command execution itself failed
    throw new LoopError('test_command_failed', error.message);
  }
}
```

### Loop Error Handling

```
❌ Loop error: Test command execution failed

Cause: Command not found: npm
Resolution:
  1. Verify npm is installed
  2. Modify test command: /ralph config

Loop has been stopped.
```

## Data Recovery

### On DB Corruption

```typescript
async function recoverDatabase(): Promise<void> {
  const backups = await listBackups();
  if (backups.length === 0) {
    throw new Error('No backups available');
  }

  const choice = await askUser({
    message: '💾 Database corruption detected',
    options: backups.map(b => `${b.date} (${b.size})`).concat(['Start fresh'])
  });

  if (choice !== 'Start fresh') {
    await restoreBackup(backups[choice]);
  } else {
    await initDatabase();
  }
}
```
