# Issue #013: Loop Engine 기본 구조

> Phase 3: Feature Layer | 의존성: #006

## 배경

Ralph Loop의 핵심인 Loop Engine 기본 구조가 필요합니다.
반복 실행, 상태 관리, 중단 조건 검사의 기본 프레임워크를 구축합니다.

## 작업 내용

1. **Loop Engine 인터페이스** (`src/features/ralph/engine.ts`)
   ```typescript
   interface LoopEngine {
     // 상태
     isRunning(): boolean;
     getCurrentRun(): LoopRun | null;

     // 제어
     start(task: string, options?: LoopOptions): Promise<LoopResult>;
     stop(): Promise<void>;

     // 이벤트
     onIteration(callback: IterationCallback): void;
     onComplete(callback: CompleteCallback): void;
   }

   interface LoopOptions {
     criteria?: SuccessCriteria;
     maxIterations?: number;
   }

   interface LoopResult {
     success: boolean;
     iterations: number;
     reason: 'success' | 'max_iterations' | 'stopped' | 'error';
   }
   ```

2. **Loop 실행 흐름**
   1. LoopRun 레코드 생성
   2. 스냅샷 생성
   3. 반복 시작
      - 프롬프트 구성
      - 실행 (외부 콜백)
      - 성공 기준 검사
      - 상태 업데이트
   4. 완료/중단 처리

3. **상태 관리**
   - 상태: `running`, `success`, `failed`, `stopped`
   - 싱글톤: 동시에 하나의 Loop만 실행

4. **반복 간 쿨다운**
   - config.ralph.cooldown_ms 적용

## 인수 조건

- [ ] Loop 시작 시 LoopRun 레코드 생성
- [ ] 반복 실행 및 콜백 호출
- [ ] 상태 전이 정확
- [ ] stop() 호출 시 즉시 중단
- [ ] 동시 실행 방지
- [ ] 쿨다운 적용

## 검증 명령

```bash
bun test src/features/ralph/__tests__/engine.test.ts

# 테스트 케이스
# - 기본 Loop 실행
# - 성공 시 종료
# - 최대 반복 도달 시 종료
# - stop() 호출 시 종료
# - 동시 실행 에러
```
