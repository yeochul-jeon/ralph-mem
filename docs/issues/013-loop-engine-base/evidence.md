# Evidence: Issue #013 Loop Engine 기본 구조

> 완료일: 2025-01-17

## 검증 결과

### 1. 테스트 통과 (24개)

```
$ bun run test tests/features/ralph/engine.test.ts
 ✓ tests/features/ralph/engine.test.ts (24 tests) 446ms

 Test Files  1 passed
      Tests  24 passed
```

### 2. Loop Engine 인터페이스

```typescript
const engine = createLoopEngine(projectPath, sessionId, { client });

// 상태 조회
engine.isRunning();      // → boolean
engine.getCurrentRun();  // → LoopRun | null

// 이벤트 콜백 등록
engine.onIteration(async (ctx) => {
  console.log(`Iteration ${ctx.iteration}`);
  return { success: false };
});

engine.onComplete((result) => {
  console.log(`Completed: ${result.reason}`);
});

// 실행
const result = await engine.start("Fix the failing tests", {
  maxIterations: 10,
  cooldownMs: 1000,
});
// → { success: true/false, iterations: 3, reason: "success", loopRunId: "loop-xxx" }

// 중단
await engine.stop();
```

### 3. Loop 실행 흐름

```typescript
// 1. LoopRun 레코드 생성
const loopRun = client.createLoopRun({
  session_id: sessionId,
  task: "Test task",
  criteria: JSON.stringify([{ type: "test_pass" }]),
  max_iterations: 10,
});

// 2. 반복 실행
while (iteration < maxIterations) {
  // - 콜백 호출
  const result = await iterationCallback({ iteration, task, loopRunId });

  // - 성공 체크
  if (result.success) {
    endLoopRun("success");
    return { success: true, reason: "success" };
  }

  // - 중단 체크
  if (stopRequested) {
    endLoopRun("stopped");
    return { success: false, reason: "stopped" };
  }

  // - 쿨다운
  await sleep(cooldownMs);
}

// 3. 최대 반복 도달
endLoopRun("failed");
return { success: false, reason: "max_iterations" };
```

### 4. 상태 전이

```
running → success   (성공 기준 충족)
running → failed    (최대 반복 도달 / 에러)
running → stopped   (stop() 호출)
```

### 5. 동시 실행 방지

```typescript
// 이미 running 상태의 LoopRun이 있으면 에러
const activeRun = client.getActiveLoopRun(sessionId);
if (activeRun) {
  throw new Error(`Loop already running: ${activeRun.id}`);
}
```

### 6. 쿨다운 적용

```typescript
// 반복 사이에 cooldownMs 만큼 대기
await engine.start("Task", {
  cooldownMs: 1000,  // 1초 대기
});
```

### 7. TypeScript 컴파일 성공

```
$ bun run typecheck
(출력 없음 = 성공)
```

## 생성된 파일

| 파일 | 설명 |
|------|------|
| `src/features/ralph/engine.ts` | Loop Engine 구현 |
| `tests/features/ralph/engine.test.ts` | 24개 테스트 |

## 구현 상세

- **createLoopEngine**: Loop Engine 팩토리 함수
- **LoopEngine.start**: Loop 시작, LoopRun 레코드 생성
- **LoopEngine.stop**: Loop 즉시 중단
- **LoopEngine.onIteration**: 반복 콜백 등록
- **LoopEngine.onComplete**: 완료 콜백 등록
- **상태 관리**: running → success/failed/stopped
- **동시 실행 방지**: getActiveLoopRun 체크
- **쿨다운**: sleep(cooldownMs) 적용
