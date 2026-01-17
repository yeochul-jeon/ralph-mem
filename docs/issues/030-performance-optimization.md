# Issue #030: 성능 최적화

> Phase 4: Polish | 의존성: #007, #021

## 배경

PRD에 정의된 성능 목표를 달성해야 합니다.

## 성능 목표

| 지표 | 목표 |
|------|------|
| 메모리 검색 응답 | < 200ms |
| Hook 실행 오버헤드 | < 50ms |
| 세션 시작 시 메모리 주입 | < 500ms |
| SQLite DB 크기 (1000 세션) | < 100MB |

## 작업 내용

1. **검색 최적화**
   - FTS5 인덱스 튜닝
   - 쿼리 최적화
   - 결과 캐싱 (LRU)

2. **Hook 최적화**
   - 비동기 처리
   - 배치 저장
   - 불필요한 검색 스킵

3. **임베딩 최적화**
   - lazy loading
   - 배치 인코딩
   - 캐시 활용

4. **DB 최적화**
   - 인덱스 확인
   - VACUUM 주기적 실행
   - 오래된 데이터 정리

5. **벤치마크 스크립트**
   ```typescript
   // bench/search.ts
   async function benchmarkSearch() {
     const start = performance.now();
     await search.search("test query");
     const elapsed = performance.now() - start;
     console.log(`Search: ${elapsed}ms`);
   }
   ```

## 인수 조건

- [ ] 검색 응답 < 200ms (1000 observations)
- [ ] Hook 오버헤드 < 50ms
- [ ] 세션 시작 < 500ms
- [ ] DB 크기 목표 달성
- [ ] 벤치마크 스크립트 존재

## 검증 명령

```bash
# 벤치마크 실행
bun run bench/search.ts
bun run bench/hooks.ts

# DB 크기 확인
ls -lh .ralph-mem/memory.db

# 프로파일링
bun --inspect run bench/full.ts
```
