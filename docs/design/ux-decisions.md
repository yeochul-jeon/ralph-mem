# UX Decisions

> UI/UX design decisions

**[한국어 버전 (Korean)](./ux-decisions.ko.md)**

## Notification Formats

### Context Injection Notification

Display as summary list instead of detailed content:

```
📝 Previous session context:
- [1/15] JWT auth middleware implementation complete
- [1/14] User model schema definition
- [1/13] Express project initialization
```

### Related Memory Found Notification

```
🔍 Related memory found:
- JWT authentication (1/15, relevance: 0.92)
- Error handling patterns (1/14, relevance: 0.85)
View details: /mem-search --layer 3 <id>
```

### Why Summary Only?

| Approach | Tokens | Pros | Cons |
|----------|--------|------|------|
| Full injection | Many | Immediately usable | Unnecessary context |
| Summary notification | Few | Efficient | Requires additional lookup |

**Choice: Summary notification** - User explicitly queries when needed

## Loop Progress Status

### Detailed Status Display

```
🔄 Ralph Loop [3/10]
├─ Task: Add user authentication
├─ Criteria: test_pass (npm test)
├─ Elapsed: 5m 23s
├─ Status: 3 tests failing → 2 tests failing
└─ Progress: ✅ Errors decreasing
```

### Status Update Timing

| Event | Display Content |
|-------|-----------------|
| Iteration start | Current iteration count |
| Test execution | Test result summary |
| Iteration complete | Progress judgment result |
| Loop end | Final result and statistics |

## Previous Session Information

### Auto Display

Automatically display previous session info at session start:

```
📋 Previous session (1/15 14:30)
├─ Task: JWT authentication implementation
├─ Status: Complete
└─ Summary: Middleware implementation, route protection applied

3 related memories found. Details: /mem-search auth
```

### Display Conditions

- Recent sessions from the same project
- Sessions within 24 hours only
- Sessions with summaries only

## Initial Setup

### Interactive Setup

Interactive setup based on project detection on first run:

```
🎯 ralph-mem initial setup

Detected project type: Node.js (TypeScript)

Test command setup:
  [1] npm test (detected)
  [2] npm run test:unit
  [3] Enter manually

Selection (default: 1): _
```

### Detection Targets

| File | Detection Content |
|------|-------------------|
| `package.json` | test/build/lint scripts |
| `tsconfig.json` | TypeScript usage |
| `pyproject.toml` | Python project |
| `.github/workflows/` | CI configuration |

### Settings Storage

```yaml
# .ralph-mem/config.yaml (auto-generated)
project:
  type: nodejs
  detected_at: 2025-01-15T10:30:00Z

ralph:
  success_criteria:
    - type: test_pass
      command: "npm test"
```

## Skill Output Formats

### /mem-search

```
🔍 Search results: "authentication" (5 items)

Layer 1 (Index):
┌────────────┬───────┬─────────────────────────┐
│ ID         │ Score │ Summary                 │
├────────────┼───────┼─────────────────────────┤
│ obs-a1b2   │ 0.95  │ JWT middleware impl     │
│ obs-c3d4   │ 0.87  │ Auth routes added       │
│ obs-e5f6   │ 0.82  │ Token validation logic  │
└────────────┴───────┴─────────────────────────┘

View details: /mem-search --layer 3 obs-a1b2
```

### /mem-status

```
📊 ralph-mem status

Memory:
├─ Sessions: 15 (last 30 days)
├─ Observations: 342
├─ Size: 12.5 MB
└─ Last backup: 1/15 14:00

Loop:
├─ Current: Inactive
├─ Total runs: 8
└─ Success rate: 75%

Settings: .ralph-mem/config.yaml
```

### /ralph status

```
🔄 Ralph Loop status

Current Loop:
├─ ID: loop-xyz123
├─ Task: Add user authentication
├─ Status: running
├─ Iteration: 3/10
├─ Started: 5 min ago
└─ Criteria: test_pass

Recent results:
├─ [3] 2 tests failing
├─ [2] 3 tests failing
└─ [1] 5 tests failing

Stop: /ralph stop
```
