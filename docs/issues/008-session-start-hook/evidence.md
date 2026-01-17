# Evidence: Issue #008 SessionStart Hook 구현

> 완료일: 2025-01-17

## 검증 결과

### 1. 테스트 통과 (12개)

```
$ bun run test tests/hooks/session-start.test.ts
 ✓ tests/hooks/session-start.test.ts (12 tests) 96ms

 Test Files  1 passed
      Tests  12 passed
```

### 2. 새 세션 생성

```typescript
const result = await sessionStartHook({ projectPath: "/my/project" });
// → { sessionId: "sess-xxx", injectedContext: "...", tokenCount: 42, metadata: {...} }
```

### 3. 이전 세션 컨텍스트 로드

```typescript
// 이전 세션 있을 때
result.injectedContext;
// → "📝 이전 세션 컨텍스트:\n- [1/15] JWT 인증 구현 완료\n- [1/14] 사용자 모델 정의"

// 이전 세션 없을 때
result.injectedContext;  // → ""
```

### 4. 설정 연동

```typescript
// auto_inject=false 시
await sessionStartHook({ projectPath }, {
  config: { memory: { auto_inject: false } }
});
// → { injectedContext: "", tokenCount: 0 }

// max_inject_tokens 제한
await sessionStartHook({ projectPath }, {
  config: { memory: { max_inject_tokens: 50 } }
});
// → tokenCount <= 50
```

### 5. DB 백업

```typescript
const result = await sessionStartHook({ projectPath });
result.metadata.backupPath;
// → "/project/.ralph-mem/backups/memory-2025-01-17T10-30-00-000Z.db"
```

### 6. TypeScript 컴파일 성공

```
$ bun run typecheck
(출력 없음 = 성공)
```

## 생성된 파일

| 파일 | 설명 |
|------|------|
| `src/hooks/session-start.ts` | SessionStart Hook 구현 |
| `tests/hooks/session-start.test.ts` | Hook 테스트 (12개) |

## 동작 흐름

1. 프로젝트 경로로 설정 로드
2. 기존 DB 백업 (있을 경우)
3. 이전 세션 목록 조회 (최근 10개)
4. 새 세션 생성
5. auto_inject=true면 이전 세션 요약 포맷팅
6. 토큰 제한 내에서 컨텍스트 생성
