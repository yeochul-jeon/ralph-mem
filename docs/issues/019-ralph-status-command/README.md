# Issue #019: /ralph status 명령 구현

> Phase 3: Feature Layer | 의존성: #013

## 배경

현재 Loop 상태를 조회하는 명령이 필요합니다.

## 작업 내용

1. **명령 정의**
   ```
   /ralph status           # 현재 Loop 상태
   /ralph status --history # 최근 Loop 이력
   ```

2. **현재 상태 출력**
   ```
   🔄 Ralph Loop 상태

   현재 Loop:
   ├─ ID: loop-xyz123
   ├─ 태스크: Add user authentication
   ├─ 상태: running
   ├─ 반복: 3/10
   ├─ 시작: 5분 전
   └─ 기준: test_pass

   최근 결과:
   ├─ [3] 테스트 2개 실패
   ├─ [2] 테스트 3개 실패
   └─ [1] 테스트 5개 실패

   중단: /ralph stop
   ```

3. **비활성 상태**
   ```
   ℹ️ 현재 실행 중인 Ralph Loop가 없습니다.

   시작: /ralph start "태스크 설명"
   ```

4. **이력 조회** (--history)
   ```
   📋 최근 Ralph Loop 이력

   ┌────────────┬────────────────────┬────────┬──────┐
   │ ID         │ 태스크             │ 상태   │ 반복 │
   ├────────────┼────────────────────┼────────┼──────┤
   │ loop-abc   │ JWT 인증 구현      │ success│ 3    │
   │ loop-def   │ 테스트 추가        │ failed │ 10   │
   └────────────┴────────────────────┴────────┴──────┘
   ```

## 인수 조건

- [x] 실행 중 Loop 상태 표시
- [x] 반복별 결과 요약 표시
- [x] 비활성 상태 메시지
- [x] --history 이력 조회

## 검증 명령

```bash
bun test tests/skills/ralph-status.test.ts

# 테스트 케이스
# - 실행 중 상태 표시
# - 비활성 상태 표시
# - 이력 조회
```

## Evidence

- [evidence.md](./evidence.md)
