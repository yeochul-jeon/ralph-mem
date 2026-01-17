# Issue #017: /ralph start 명령 구현

> Phase 3: Feature Layer | 의존성: #013, #014, #015, #016

## 배경

Ralph Loop를 시작하는 명령이 필요합니다.
태스크 설명과 성공 기준을 받아 Loop를 실행합니다.

## 작업 내용

1. **Skill 정의** (`src/skills/ralph.ts`)
   ```typescript
   // /ralph start "Add JWT authentication" --criteria test_pass
   interface RalphStartArgs {
     task: string;
     criteria?: CriteriaType;
     maxIterations?: number;
   }
   ```

2. **명령어 파싱**
   ```
   /ralph start "태스크 설명"
   /ralph start "태스크" --criteria build_success
   /ralph start "태스크" --max-iterations 5
   ```

3. **실행 흐름**
   1. 이미 실행 중인 Loop 확인
   2. 설정에서 기본값 로드
   3. Loop Engine.start() 호출
   4. 시작 메시지 출력

4. **시작 메시지**
   ```
   🚀 Ralph Loop 시작

   태스크: Add JWT authentication
   기준: test_pass (npm test)
   최대 반복: 10

   Loop ID: loop-abc123
   중단: /ralph stop
   ```

## 인수 조건

- [x] 태스크 설명 파싱
- [x] --criteria 옵션 동작
- [x] --max-iterations 옵션 동작
- [x] 이미 실행 중일 때 에러
- [x] 시작 메시지 출력

## Evidence

[완료 검증 문서](./evidence.md)

## 검증 명령

```bash
bun test src/skills/__tests__/ralph-start.test.ts

# 테스트 케이스
# - 기본 시작
# - 옵션과 함께 시작
# - 실행 중 재시작 시도 → 에러
# - 잘못된 criteria → 에러
```
