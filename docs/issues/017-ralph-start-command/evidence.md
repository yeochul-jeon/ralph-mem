# Evidence: Issue #017 /ralph start 명령 구현

> 완료일: 2025-01-17

## 검증 결과

### 1. 테스트 통과 (31개)

```
$ bun run test tests/skills/ralph-start.test.ts
 ✓ tests/skills/ralph-start.test.ts (31 tests) 2162ms

 Test Files  1 passed
      Tests  31 passed
```

### 2. 명령어 파싱

```typescript
const args = parseStartArgs('"Add JWT authentication" --criteria build_success --max-iterations 5');

// → {
//   task: "Add JWT authentication",
//   criteria: "build_success",
//   maxIterations: 5
// }
```

### 3. 지원 옵션

| 옵션 | 설명 | 예시 |
|------|------|------|
| --criteria | 성공 기준 타입 | `--criteria test_pass` |
| --max-iterations | 최대 반복 횟수 | `--max-iterations 10` |
| --cooldown | 반복 간 대기 시간 | `--cooldown 2000` |
| --no-snapshot | 스냅샷 비활성화 | `--no-snapshot` |

### 4. 사용 예시

```bash
# 기본 사용
/ralph start "Fix the failing tests"

# 빌드 성공 기준
/ralph start "Add user authentication" --criteria build_success

# 최대 반복 제한
/ralph start "Refactor database layer" --max-iterations 5

# 복합 옵션
/ralph start "Full refactor" --criteria type_check --max-iterations 20 --no-snapshot
```

### 5. 시작 메시지

```
🚀 Ralph Loop 시작

태스크: Add JWT authentication
기준: test_pass (npm test)
최대 반복: 10

Loop ID: loop-abc123
중단: /ralph stop
```

### 6. 에러 처리

```typescript
// 태스크 없음
await skill.start({ task: "" });
// → 태스크 설명이 필요합니다. 사용법: /ralph start "태스크 설명"

// 이미 실행 중
await skill.start({ task: "New task" }); // while another is running
// → 이미 Loop가 실행 중입니다. (ID: loop-xxx)
```

### 7. createRalphSkill API

```typescript
const skill = createRalphSkill({
  projectPath: "/path/to/project",
  sessionId: "sess-123",
  client: dbClient,
});

// 시작
const startResult = await skill.start({ task: "My task" });

// 중단
const stopResult = await skill.stop({ rollback: true });

// 상태
const statusResult = await skill.status();

// 정리
skill.close();
```

### 8. executeRalphCommand

```typescript
const result = await executeRalphCommand(
  "start",
  '"Build the app" --criteria build_success',
  context
);
// → 🚀 Ralph Loop 시작 ...
```

### 9. TypeScript 컴파일 성공

```
$ bun run typecheck
(출력 없음 = 성공)
```

## 생성된 파일

| 파일 | 설명 |
|------|------|
| `src/skills/ralph.ts` | Ralph skill 구현 (기존 파일 확장) |
| `tests/skills/ralph-start.test.ts` | 31개 테스트 |

## 구현 상세

- **parseStartArgs**: 명령어 인자 파싱 (따옴표 지원)
- **createRalphSkill**: Ralph skill 팩토리
- **skill.start**: Loop 시작
- **skill.stop**: Loop 중단 (롤백 옵션)
- **skill.status**: Loop 상태 조회
- **executeRalphCommand**: 명령 문자열 실행
- **formatStartMessage**: 시작 메시지 포맷팅
- **formatStopMessage**: 중단 메시지 포맷팅
- **formatStatusMessage**: 상태 메시지 포맷팅

## 전체 테스트

```
$ bun run test
 Test Files  16 passed (16)
      Tests  385 passed (385)
```
