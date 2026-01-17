# Issue #018: /ralph stop 명령 구현

> Phase 3: Feature Layer | 의존성: #013

## 배경

실행 중인 Ralph Loop를 중단하는 명령이 필요합니다.

## 작업 내용

1. **명령 정의**
   ```
   /ralph stop
   /ralph stop --rollback   # 스냅샷으로 롤백 후 중단
   ```

2. **실행 흐름**
   1. 실행 중인 Loop 확인
   2. Loop Engine.stop() 호출
   3. 상태를 'stopped'로 변경
   4. 롤백 옵션 시 스냅샷 복원
   5. 종료 메시지 출력

3. **종료 메시지**
   ```
   ⏹️ Ralph Loop 중단됨

   태스크: Add JWT authentication
   반복: 3회
   상태: stopped

   💾 스냅샷: .ralph-mem/snapshots/loop-abc123
   롤백: /ralph rollback
   ```

4. **에러 처리**
   - 실행 중인 Loop 없으면 안내

## 인수 조건

- [x] 실행 중인 Loop 중단
- [x] 상태 'stopped'로 변경
- [x] --rollback 옵션 시 파일 복원
- [x] 종료 메시지 출력
- [x] Loop 없을 때 안내 메시지

## 검증 명령

```bash
bun test tests/skills/ralph-stop.test.ts

# 테스트 케이스
# - 실행 중 Loop 중단
# - 롤백 옵션
# - Loop 없을 때 메시지
```

## Evidence

- [evidence.md](./evidence.md)
