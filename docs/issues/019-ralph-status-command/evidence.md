# Evidence: Issue #019 /ralph status 명령

> 완료일: 2025-01-17

## 검증 결과

### 1. 테스트 통과 (15개)

```
$ bun run test tests/skills/ralph-status.test.ts
 ✓ tests/skills/ralph-status.test.ts (15 tests) 1103ms

 Test Files  1 passed
      Tests  15 passed
```

### 2. formatStatusMessage

```typescript
// 비활성 상태
const message = formatStatusMessage(false);
// → "📊 Ralph Loop 상태: 실행 중인 Loop 없음\n\n시작: /ralph start \"태스크 설명\""

// 실행 중
const message = formatStatusMessage(true, {
  id: "loop-abc123",
  task: "Fix tests",
  iterations: 3,
  maxIterations: 10,
  startedAt: new Date(Date.now() - 65000),
});
// → "📊 Ralph Loop 상태: 실행 중\n\nLoop ID: loop-abc123\n태스크: Fix tests\n반복: 3/10\n경과: 1분 5초\n\n중단: /ralph stop"
```

### 3. formatHistoryMessage

```typescript
const history: LoopHistoryEntry[] = [
  { id: "loop-abc123", task: "JWT 인증 구현", status: "success", iterations: 3, startedAt: new Date() },
  { id: "loop-def456", task: "테스트 추가", status: "failed", iterations: 10, startedAt: new Date() },
];

const message = formatHistoryMessage(history);
// → 테이블 형식 출력:
// 📋 최근 Ralph Loop 이력
// ┌────────────────┬──────────────────────┬─────────┬──────┐
// │ ID             │ 태스크               │ 상태    │ 반복 │
// ├────────────────┼──────────────────────┼─────────┼──────┤
// │ loop-abc123    │ JWT 인증 구현        │ success │    3 │
// │ loop-def456    │ 테스트 추가          │ failed  │   10 │
// └────────────────┴──────────────────────┴─────────┴──────┘
```

### 4. skill.status()

```typescript
const skill = createRalphSkill(context);

// 기본 상태 조회
const result = await skill.status();
// → { isRunning: false, message: "📊 Ralph Loop 상태: 실행 중인 Loop 없음..." }

// 이력 조회
const result = await skill.status({ history: true });
// → { isRunning: false, history: [...], message: "📋 최근 Ralph Loop 이력..." }
```

### 5. executeRalphCommand

```typescript
// 기본 상태
const result = await executeRalphCommand("status", "", context);
// → "📊 Ralph Loop 상태: ..."

// 이력 조회
const result = await executeRalphCommand("status", "--history", context);
// → "📋 최근 Ralph Loop 이력..."
```

### 6. DBClient.listLoopRuns

```typescript
// Loop 이력 조회
const runs = client.listLoopRuns(sessionId);
// → [{ id: "loop-...", task: "...", status: "...", ... }, ...]

// 제한 설정
const runs = client.listLoopRuns(sessionId, 5);
// → 최대 5개 반환
```

### 7. TypeScript 컴파일 성공

```
$ bun run typecheck
(출력 없음 = 성공)
```

## 생성된 파일

| 파일 | 설명 |
|------|------|
| `tests/skills/ralph-status.test.ts` | 15개 테스트 |

## 수정된 파일

| 파일 | 변경 내용 |
|------|------|
| `src/skills/ralph.ts` | status --history 기능, formatHistoryMessage 추가 |
| `src/core/db/client.ts` | listLoopRuns 메서드 추가 |

## 구현 상세

- **formatStatusMessage**: 현재 Loop 상태 포맷팅 (실행 중/비활성)
- **formatHistoryMessage**: Loop 이력 테이블 포맷팅
- **skill.status({ history })**: 이력 조회 옵션 추가
- **DBClient.listLoopRuns**: 세션별 Loop 이력 조회

## 전체 테스트

```
$ bun run test
 Test Files  18 passed (18)
      Tests  412 passed (412)
```
