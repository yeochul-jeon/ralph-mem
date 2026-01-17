# Issue #009: SessionEnd Hook 구현

> Phase 2: Hook Layer | 의존성: #006

## 배경

세션 종료 시 자동으로 실행되는 hook이 필요합니다.
세션 요약을 생성하고 저장합니다.

## 작업 내용

1. **SessionEnd Hook** (`src/hooks/session-end.ts`)
   ```typescript
   interface SessionEndHook {
     execute(context: SessionEndContext): Promise<void>;
   }

   interface SessionEndContext {
     sessionId: string;
     reason: 'user' | 'timeout' | 'error';
   }
   ```

2. **동작 흐름**
   1. 현재 세션의 모든 observations 조회
   2. 요약 생성 (Claude 호출 또는 간단 요약)
   3. 세션 업데이트 (summary, ended_at)
   4. 세션 종료 처리

3. **요약 생성**
   - 주요 작업 내용
   - 해결한 문제
   - 남은 이슈
   - 사용된 도구 통계

4. **주기적 요약** (선택적)
   - 30분마다 중간 요약 생성
   - 긴 세션에서 컨텍스트 유지

## 인수 조건

- [x] 세션 종료 시 ended_at 기록
- [x] 요약 생성 및 저장
- [x] observations 없을 때도 정상 종료
- [x] 에러 발생 시 graceful 처리
- [x] 종료 이유(reason) 기록

## Evidence

[완료 증빙](./evidence.md)

## 검증 명령

```bash
bun test src/hooks/__tests__/session-end.test.ts

# 테스트 케이스
# - 정상 세션 종료
# - 요약 생성 확인
# - observations 없는 세션 종료
# - 이미 종료된 세션 재종료 시 무시
```
