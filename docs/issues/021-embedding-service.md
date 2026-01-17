# Issue #021: Embedding 서비스 구현

> Phase 4: Polish | 의존성: #007

## 배경

FTS5 검색 결과가 부족할 때 의미 기반 검색을 위한 Embedding이 필요합니다.
paraphrase-multilingual 모델을 로컬에서 실행합니다.

## 작업 내용

1. **Embedding 서비스** (`src/core/embedding.ts`)
   ```typescript
   interface EmbeddingService {
     encode(text: string): Promise<number[]>;
     encodeBatch(texts: string[]): Promise<number[][]>;
     isReady(): boolean;
   }
   ```

2. **모델 로딩**
   - @xenova/transformers 사용
   - 모델: `Xenova/paraphrase-multilingual-MiniLM-L12-v2`
   - lazy loading (첫 사용 시 로드)

3. **비동기 생성**
   ```typescript
   async function addObservationWithEmbedding(obs: CreateObservation) {
     // 1. 즉시 저장
     const saved = await store.insert(obs);

     // 2. 백그라운드 임베딩
     queueMicrotask(async () => {
       const embedding = await embeddingService.encode(obs.content);
       await store.updateEmbedding(saved.id, embedding);
     });

     return saved;
   }
   ```

4. **Search Engine 통합**
   - FTS5 결과 부족 시 embedding 검색 폴백
   - 코사인 유사도 계산

## 인수 조건

- [ ] 모델 로딩 성공
- [ ] 텍스트 → 384차원 벡터 변환
- [ ] 한국어 텍스트 인코딩
- [ ] 영어 텍스트 인코딩
- [ ] 비동기 생성 동작
- [ ] 유사도 검색 동작

## 검증 명령

```bash
bun test src/core/__tests__/embedding.test.ts

# 테스트 케이스
# - 영어 텍스트 인코딩
# - 한국어 텍스트 인코딩
# - 유사 텍스트 높은 유사도
# - 다른 텍스트 낮은 유사도
# - 배치 인코딩
```
