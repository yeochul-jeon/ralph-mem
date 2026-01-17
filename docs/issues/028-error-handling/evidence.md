# Evidence: Issue #028 에러 핸들링 및 Graceful Degradation

> 완료일: 2025-01-17

## 검증 결과

### 1. 테스트 통과 (41개)

```
$ bun run test tests/utils/errors.test.ts
 ✓ tests/utils/errors.test.ts (41 tests) 76ms

 Test Files  1 passed
      Tests  41 passed
```

### 2. Low 에러 → 계속 진행

```typescript
const lowError = createError("Minor issue", { level: "low" });
logger.logError(lowError); // → [INFO] 레벨로 로깅
// 실행 계속됨
```

### 3. Medium 에러 → 폴백 시도

```typescript
const result = await tryWithFallback(
  () => { throw new Error("Primary failed"); },
  () => "fallback result"
);
result; // → "fallback result"
```

### 4. High 에러 → 사용자 선택

```typescript
const manager = new ErrorManager();
manager.setRecoveryHandler(async (error, options) => {
  // options: [{ id: "retry", label: "재시도" }, { id: "abort", label: "중단" }]
  return { optionId: "retry", error };
});

const error = createError("DB connection failed", {
  level: "high",
  code: ErrorCodes.DB_CONNECTION_FAILED
});
await manager.handle(error); // → recovery handler 호출됨
```

### 5. Graceful Degradation

```typescript
const result = await withGracefulDegradation({
  primary: () => { throw new Error("Primary failed"); },
  fallbacks: [
    { name: "fallback1", fn: () => { throw new Error("Fallback1 failed"); } },
    { name: "fallback2", fn: () => "fallback2 result" }
  ],
  defaultValue: "default"
});

result.value;        // → "fallback2 result"
result.degraded;     // → true
result.fallbackUsed; // → "fallback2"
```

### 6. 로그 파일 생성

```typescript
const logger = new Logger({
  level: "info",
  file: true,
  filePath: "/path/to/log.txt"
});

logger.info("Test message");
// → 파일에 "[2025-01-17T...] [INFO] Test message" 기록됨
```

### 7. 로그 로테이션

```typescript
const logger = new Logger({
  level: "info",
  file: true,
  filePath: "/path/to/log.txt",
  maxFileSize: 100, // 100 bytes
  maxFiles: 3
});

// 많은 로그 작성 시
// log.txt → log.txt.1 → log.txt.2 로테이션
```

### 8. 사용자 선택 UI 포맷

```
❌ 데이터베이스 연결 실패

선택:
  [1] 재시도 - 연결을 다시 시도합니다
  [2] 메모리 기능 없이 계속 - 메모리 기능을 비활성화하고 진행합니다
  [3] 세션 중단 - 현재 세션을 종료합니다
```

### 9. 에러 코드

```typescript
const codes = ErrorCodes;
// DB_CONNECTION_FAILED, DB_QUERY_FAILED, DB_WRITE_FAILED
// SEARCH_FAILED, FTS_FAILED, EMBEDDING_FAILED
// CONFIG_INVALID, CONFIG_NOT_FOUND
// LOOP_FAILED, CRITERIA_CHECK_FAILED
// UNKNOWN_ERROR
```

### 10. TypeScript 컴파일 성공

```
$ bun run typecheck
(출력 없음 = 성공)
```

## 생성된 파일

| 파일 | 설명 |
|------|------|
| `src/utils/errors.ts` | 에러 핸들링 시스템 구현 |
| `tests/utils/errors.test.ts` | 41개 테스트 |

## 구현 상세

- **createError**: RalphError 생성
- **isRalphError**: RalphError 타입 체크
- **wrapError**: 일반 에러를 RalphError로 래핑
- **getRecoveryOptions**: 에러 코드별 복구 옵션
- **Logger**: 레벨별 로깅, 파일 출력, 로테이션
- **ErrorManager**: 에러 핸들러 등록, 복구 핸들러
- **tryWithFallback**: 폴백 패턴
- **tryWithRetry**: 재시도 패턴
- **withGracefulDegradation**: 점진적 성능 저하 패턴
- **formatErrorForUser**: 사용자용 에러 메시지
- **formatRecoveryOptions**: 복구 옵션 포맷

## 전체 테스트

```
$ bun run test
 Test Files  27 passed (27)
      Tests  674 passed | 4 skipped (678)
```
