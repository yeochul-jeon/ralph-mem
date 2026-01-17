# Issue #008: SessionStart Hook 구현

> Phase 2: Hook Layer | 의존성: #006

## 배경

세션 시작 시 자동으로 실행되는 hook이 필요합니다.
이전 세션 컨텍스트를 로드하고 새 세션을 생성합니다.

## 작업 내용

1. **SessionStart Hook** (`src/hooks/session-start.ts`)
   ```typescript
   interface SessionStartHook {
     execute(context: HookContext): Promise<HookResult>;
   }

   interface HookContext {
     projectPath: string;
     sessionId?: string;
   }

   interface HookResult {
     injectedContext?: string;
     metadata?: Record<string, unknown>;
   }
   ```

2. **동작 흐름**
   1. 프로젝트 경로 감지
   2. DB 백업 실행
   3. 새 세션 생성 (Memory Store)
   4. 이전 세션 요약 로드 (최근 N개)
   5. 컨텍스트 주입 문자열 생성

3. **출력 형식**
   ```
   📝 이전 세션 컨텍스트:
   - [1/15] JWT 인증 미들웨어 구현 완료
   - [1/14] 사용자 모델 스키마 정의
   ```

4. **설정 연동**
   - `memory.auto_inject`: false면 컨텍스트 주입 스킵
   - `memory.max_inject_tokens`: 토큰 제한

## 인수 조건

- [ ] 세션 시작 시 새 Session 레코드 생성
- [ ] 이전 세션 요약 로드 성공
- [ ] 설정된 토큰 제한 내 컨텍스트 생성
- [ ] auto_inject=false 시 빈 컨텍스트
- [ ] DB 백업 파일 생성 확인

## 검증 명령

```bash
bun test src/hooks/__tests__/session-start.test.ts

# 테스트 케이스
# - 새 세션 생성 확인
# - 이전 세션 있을 때 컨텍스트 주입
# - 이전 세션 없을 때 빈 컨텍스트
# - 토큰 제한 준수
# - 설정 플래그 동작
```
