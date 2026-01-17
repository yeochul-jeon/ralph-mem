# Issue #026: /mem-forget Skill 구현

> Phase 4: Polish | 의존성: #006

## 배경

특정 메모리를 삭제하는 skill이 필요합니다.
민감 정보가 기록되었을 때 삭제할 수 있어야 합니다.

## 작업 내용

1. **Skill 정의** (`src/skills/mem-forget.ts`)
   ```typescript
   interface MemForgetSkill {
     name: '/mem-forget';
     execute(args: MemForgetArgs): Promise<string>;
   }

   interface MemForgetArgs {
     id?: string;           // 단일 삭제
     sessionId?: string;    // 세션 전체 삭제
     before?: string;       // 날짜 이전 삭제
     confirm?: boolean;
   }
   ```

2. **명령어 형식**
   ```
   /mem-forget obs-xyz123
   /mem-forget --session sess-abc
   /mem-forget --before 7d
   /mem-forget --before 7d --confirm
   ```

3. **확인 절차**
   - 삭제 전 영향 범위 표시
   - --confirm 없으면 확인 요청

4. **출력**
   ```
   ⚠️ 삭제 대상:
   - obs-xyz123: JWT 토큰 설정
   - obs-abc456: 인증 미들웨어

   삭제하려면: /mem-forget obs-xyz123 --confirm
   ```

   ```
   ✅ 삭제됨: 2개 observation
   ```

## 인수 조건

- [x] 단일 ID 삭제
- [x] 세션 전체 삭제
- [x] 날짜 기준 삭제
- [x] 확인 없이 삭제 방지
- [x] FTS 인덱스에서도 제거

## Evidence

[evidence.md](evidence.md)

## 검증 명령

```bash
bun test src/skills/__tests__/mem-forget.test.ts

# 테스트 케이스
# - 단일 삭제
# - 세션 삭제
# - 확인 절차
# - 삭제 후 검색 불가
```
