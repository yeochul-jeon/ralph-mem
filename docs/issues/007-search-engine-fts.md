# Issue #007: Search Engine 구현 (FTS5)

> Phase 1: Core Layer | 의존성: #004

## 배경

FTS5 기반 전문 검색 엔진이 필요합니다.
이 이슈에서는 FTS5 검색만 구현하고, Embedding 폴백은 별도 이슈에서 처리합니다.

## 작업 내용

1. **Search Engine 인터페이스** (`src/core/search.ts`)
   ```typescript
   interface SearchEngine {
     search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
   }

   interface SearchOptions {
     limit?: number;           // 기본: 10
     layer?: 1 | 2 | 3;        // Progressive Disclosure
     since?: Date;
     types?: ObservationType[];
     projectPath?: string;
   }

   interface SearchResult {
     id: string;
     score: number;
     // Layer 1
     summary?: string;
     // Layer 2
     createdAt?: Date;
     sessionId?: string;
     // Layer 3
     content?: string;
     metadata?: Record<string, unknown>;
   }
   ```

2. **FTS5 검색 쿼리**
   - MATCH 쿼리 생성
   - BM25 스코어링
   - 필터 적용 (type, since, projectPath)

3. **Progressive Disclosure 구현**
   - Layer 1: id, score, summary만 반환
   - Layer 2: + createdAt, sessionId, 관련 정보
   - Layer 3: + 전체 content, metadata

4. **검색어 전처리**
   - 특수문자 이스케이프
   - 한국어 토크나이징 고려

## 인수 조건

- [ ] 키워드 검색 결과 반환
- [ ] score 기준 정렬
- [ ] limit 옵션 동작
- [ ] since 필터 동작
- [ ] types 필터 동작
- [ ] Layer 1/2/3 차별화된 결과

## 검증 명령

```bash
bun test src/core/__tests__/search.test.ts

# 테스트 케이스
# - 단일 키워드 검색
# - 복합 키워드 검색
# - 필터 조합 테스트
# - Progressive Disclosure 각 레이어
# - 결과 없을 때 빈 배열
```
