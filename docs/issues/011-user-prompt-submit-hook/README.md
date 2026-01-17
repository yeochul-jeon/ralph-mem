# Issue #011: UserPromptSubmit Hook 구현

> Phase 2: Hook Layer | 의존성: #007

## 배경

사용자 프롬프트 제출 시 자동으로 실행되는 hook이 필요합니다.
관련 메모리를 검색하고 알림을 표시합니다.

## 작업 내용

1. **UserPromptSubmit Hook** (`src/hooks/user-prompt-submit.ts`)
   ```typescript
   interface UserPromptSubmitHook {
     execute(context: PromptContext): Promise<PromptResult>;
   }

   interface PromptContext {
     prompt: string;
     projectPath: string;
   }

   interface PromptResult {
     notification?: string;
     relatedMemories?: SearchResult[];
   }
   ```

2. **동작 흐름**
   1. 프롬프트에서 키워드 추출
   2. Search Engine으로 관련 메모리 검색
   3. 결과를 요약 알림으로 변환
   4. 알림 문자열 반환

3. **알림 형식**
   ```
   🔍 관련 메모리 발견:
   - JWT 인증 (1/15, 관련도: 0.92)
   - 에러 처리 패턴 (1/14, 0.85)
   상세 조회: /mem-search --layer 3 <id>
   ```

4. **키워드 추출**
   - 불용어 제거
   - 중요 키워드 식별
   - 검색어 구성

## 인수 조건

- [ ] 프롬프트에서 키워드 추출
- [ ] 관련 메모리 검색 성공
- [ ] 결과 있을 때 알림 생성
- [ ] 결과 없을 때 알림 없음
- [ ] 검색 실패 시 graceful 처리

## 검증 명령

```bash
bun test src/hooks/__tests__/user-prompt-submit.test.ts

# 테스트 케이스
# - 관련 메모리 있을 때 알림
# - 관련 메모리 없을 때 빈 결과
# - 키워드 추출 정확도
# - 알림 형식 검증
```
