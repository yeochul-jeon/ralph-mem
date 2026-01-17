# Issue #028: 에러 핸들링 및 Graceful Degradation

> Phase 4: Polish | 의존성: #006, #007, #013

## 배경

플러그인이 안정적으로 동작하려면 체계적인 에러 처리가 필요합니다.
에러 발생 시에도 기본 기능은 유지되어야 합니다.

## 작업 내용

1. **에러 레벨 정의** (`src/utils/errors.ts`)
   ```typescript
   type ErrorLevel = 'low' | 'medium' | 'high';

   interface RalphError extends Error {
     level: ErrorLevel;
     recoverable: boolean;
     context?: Record<string, unknown>;
   }
   ```

2. **레벨별 처리**
   | 레벨 | 동작 | 예시 |
   |------|------|------|
   | Low | 로그만 | 임베딩 생성 실패 |
   | Medium | 폴백 시도 + 알림 | FTS 검색 실패 |
   | High | 사용자 선택 요청 | DB 연결 실패 |

3. **Graceful Degradation**
   - DB 실패 → 메모리 큐 사용
   - Embedding 실패 → FTS만 사용
   - 검색 실패 → 빈 결과 반환

4. **사용자 선택 UI**
   ```
   ❌ 데이터베이스 연결 실패

   선택:
     [1] 재시도
     [2] 메모리 기능 없이 계속
     [3] 세션 중단

   선택: _
   ```

5. **로깅**
   - 설정된 레벨 이상만 로그
   - 파일 로그 지원
   - 로그 로테이션

## 인수 조건

- [x] Low 에러 → 계속 진행
- [x] Medium 에러 → 폴백 시도
- [x] High 에러 → 사용자 선택
- [x] 폴백 동작 정상
- [x] 로그 파일 생성

## Evidence

[evidence.md](evidence.md)

## 검증 명령

```bash
bun test src/utils/__tests__/errors.test.ts

# 테스트 케이스
# - 에러 레벨별 처리
# - 폴백 로직
# - 로깅 동작
```
