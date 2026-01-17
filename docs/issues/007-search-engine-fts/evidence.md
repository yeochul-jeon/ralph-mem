# Evidence: Issue #007 Search Engine 구현 (FTS5)

> 완료일: 2025-01-17

## 검증 결과

### 1. 테스트 통과 (16개)

```
$ bun run test tests/core/search.test.ts
 ✓ tests/core/search.test.ts (16 tests) 30ms

 Test Files  1 passed
      Tests  16 passed
```

### 2. FTS5 검색

```typescript
const engine = createSearchEngine(client);

// 키워드 검색
const results = engine.search("typescript");
// → [{ id: "obs-xxx", score: 0.00001, summary: "..." }, ...]

// 복합 키워드 (OR 검색)
engine.search("typescript error");
```

### 3. 검색 옵션

```typescript
// Limit
engine.search("typescript", { limit: 5 });

// Type 필터
engine.search("typescript", { types: ["error", "note"] });

// 날짜 필터
engine.search("typescript", { since: new Date("2025-01-01") });

// 프로젝트 필터
engine.search("typescript", { projectPath: "/my/project" });
```

### 4. Progressive Disclosure

```typescript
// Layer 1: 기본 정보만
engine.search("query", { layer: 1 });
// → { id, score, summary }

// Layer 2: 컨텍스트 추가
engine.search("query", { layer: 2 });
// → { id, score, summary, createdAt, sessionId, type, toolName }

// Layer 3: 전체 상세
engine.search("query", { layer: 3 });
// → { id, score, summary, createdAt, sessionId, type, toolName, content, metadata }
```

### 5. 검색어 이스케이프

```typescript
// 특수문자 처리
engine.search('test "quoted" (parens)');  // 에러 없이 처리
```

### 6. TypeScript 컴파일 성공

```
$ bun run typecheck
(출력 없음 = 성공)
```

## 생성된 파일

| 파일 | 설명 |
|------|------|
| `src/core/search.ts` | SearchEngine 인터페이스 및 FTS5 구현 |
| `tests/core/search.test.ts` | 검색 테스트 (16개) |

## 구현 상세

- **BM25 스코어링**: SQLite FTS5의 bm25() 함수 사용
- **쿼리 전처리**: 따옴표 이스케이프, prefix 매칭(*)
- **필터 조합**: WHERE 절 동적 생성
- **JOIN**: observations ↔ sessions 연결하여 projectPath 필터 지원
