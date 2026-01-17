# Evidence: Issue #011 UserPromptSubmit Hook 구현

> 완료일: 2025-01-17

## 검증 결과

### 1. 테스트 통과 (21개)

```
$ bun run test tests/hooks/user-prompt-submit.test.ts
 ✓ tests/hooks/user-prompt-submit.test.ts (21 tests) 123ms

 Test Files  1 passed
      Tests  21 passed
```

### 2. 키워드 추출

```typescript
extractKeywords("How do I configure TypeScript?");
// → ["configure", "typescript"]

extractKeywords("TypeScript 설정을 어떻게 하나요?");
// → ["typescript", "설정을", "어떻게", "하나요"]

// Stopwords 제거
extractKeywords("the is a an");
// → []

// 최대 5개 키워드
extractKeywords("one two three four five six seven");
// → ["one", "two", "three", "four", "five"]
```

### 3. 알림 형식

```typescript
const results = [
  { id: "obs-1", score: 0.92, summary: "JWT 인증 구현", createdAt: new Date("2025-01-15") },
  { id: "obs-2", score: 0.85, summary: "에러 처리 패턴", createdAt: new Date("2025-01-14") },
];

formatNotification(results);
// →
// 🔍 관련 메모리 발견:
// - JWT 인증 구현 (1. 15., 관련도: 0.92)
// - 에러 처리 패턴 (1. 14., 관련도: 0.85)
// 상세 조회: /mem-search --layer 3 <id>
```

### 4. Context 주입

```typescript
const results = [
  { id: "obs-1", score: 0.9, content: "JWT token implementation details", createdAt: new Date() },
];

formatContext(results, 1000);
// → {
//     context: "📝 관련 기억:\n- [1. 17.] JWT token implementation details",
//     tokenCount: 20
//   }
```

### 5. userPromptSubmitHook 동작

```typescript
// 관련 메모리 있을 때
const result = await userPromptSubmitHook({
  prompt: "TypeScript configuration",
  sessionId,
  projectPath,
}, { client, engine });
// → {
//     notification: "🔍 관련 메모리 발견:...",
//     injectedContext: "📝 관련 기억:...",
//     tokenCount: 50,
//     relatedMemories: [...]
//   }

// 관련 메모리 없을 때
await userPromptSubmitHook({
  prompt: "Python Django",
  ...
});
// → { notification: "", relatedMemories: [] }
```

### 6. Graceful 에러 처리

```typescript
// 검색 실패 시에도 에러 발생 안 함
const result = await userPromptSubmitHook(context, { client: closedClient });
// → { notification: "", relatedMemories: [] }
```

### 7. TypeScript 컴파일 성공

```
$ bun run typecheck
(출력 없음 = 성공)
```

## 생성된 파일

| 파일 | 설명 |
|------|------|
| `src/hooks/user-prompt-submit.ts` | UserPromptSubmit hook 구현 |
| `tests/hooks/user-prompt-submit.test.ts` | 21개 테스트 |

## 구현 상세

- **extractKeywords**: 프롬프트에서 불용어 제거 후 키워드 추출 (최대 5개)
- **formatNotification**: 검색 결과를 사용자 알림 형식으로 변환
- **formatContext**: 검색 결과를 context injection용 형식으로 변환
- **userPromptSubmitHook**: 키워드 추출 → 검색 → 알림/context 생성
- **Stopwords**: 영어/한국어 불용어 + 명령형 단어 필터링
- **Token limit**: config.memory.max_inject_tokens 준수
