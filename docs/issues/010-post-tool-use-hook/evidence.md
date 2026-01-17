# Evidence: Issue #010 PostToolUse Hook 구현

> 완료일: 2025-01-17

## 검증 결과

### 1. 테스트 통과 (35개)

```
$ bun run test tests/hooks/post-tool-use.test.ts
 ✓ tests/hooks/post-tool-use.test.ts (35 tests) 129ms

 Test Files  1 passed
      Tests  35 passed
```

### 2. 도구 필터링

```typescript
// 기록 대상
shouldRecordTool("Edit");   // → true
shouldRecordTool("Write");  // → true
shouldRecordTool("Bash");   // → true

// 기록 안 함
shouldRecordTool("Read");   // → false
shouldRecordTool("Glob");   // → false
shouldRecordTool("Grep");   // → false
```

### 3. Observation 타입

```typescript
getObservationType("Bash", true);   // → "bash"
getObservationType("Edit", true);   // → "tool_use"
getObservationType("Bash", false);  // → "error"
```

### 4. 중요도 계산

```typescript
// 에러: 1.0
calculateImportance({ success: false, ... });

// 테스트 결과: 0.9
calculateImportance({ toolName: "Bash", toolOutput: "Tests passed", success: true });

// 파일 수정: 0.7
calculateImportance({ toolName: "Edit", success: true });

// 일반 명령: 0.5
calculateImportance({ toolName: "Bash", toolOutput: "ls", success: true });
```

### 5. Privacy 필터

```typescript
// exclude_patterns 매칭
shouldExclude("Reading .env file", ["*.env"]);  // → true
shouldExclude("secret=abc", ["*secret*"]);      // → true
shouldExclude("normal content", ["*.env"]);     // → false

// 민감 정보 마스킹
maskSensitiveData("api_key = sk-proj-abc123...");
// → "api_key = [MASKED]"

maskSensitiveData("Bearer eyJhbGci...");
// → "Bearer [MASKED]"
```

### 6. postToolUseHook 동작

```typescript
// Edit 도구 기록
const result = await postToolUseHook({
  toolName: "Edit",
  toolOutput: "File updated",
  sessionId,
  projectPath,
  success: true,
}, { client });
// → { recorded: true, type: "tool_use", importance: 0.7 }

// Read 도구 기록 안 함
await postToolUseHook({
  toolName: "Read",
  ...
});
// → { recorded: false }
```

### 7. TypeScript 컴파일 성공

```
$ bun run typecheck
(출력 없음 = 성공)
```

## 생성된 파일

| 파일 | 설명 |
|------|------|
| `src/hooks/post-tool-use.ts` | PostToolUse hook 구현 |
| `tests/hooks/post-tool-use.test.ts` | 35개 테스트 |

## 구현 상세

- **shouldRecordTool**: Edit/Write/Bash 기록, Read/Glob/Grep 제외
- **getObservationType**: 성공 여부와 도구 타입에 따라 type 결정
- **calculateImportance**: 에러(1.0) > 테스트(0.9) > 파일수정(0.7) > 일반(0.5)
- **formatOutput**: 2000자 초과 시 truncate
- **shouldExclude**: glob 패턴으로 privacy 필터링
- **maskSensitiveData**: API key, Bearer token, 환경변수 마스킹
