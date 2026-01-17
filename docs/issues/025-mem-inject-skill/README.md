# Issue #025: /mem-inject Skill 구현

> Phase 4: Polish | 의존성: #006

## 배경

수동으로 컨텍스트를 메모리에 주입하는 skill이 필요합니다.

## 작업 내용

1. **Skill 정의** (`src/skills/mem-inject.ts`)
   ```typescript
   interface MemInjectSkill {
     name: '/mem-inject';
     execute(args: MemInjectArgs): Promise<string>;
   }

   interface MemInjectArgs {
     content: string;
     type?: 'note' | 'context';
     importance?: number;
   }
   ```

2. **명령어 형식**
   ```
   /mem-inject "이 프로젝트는 Express + Prisma 기반"
   /mem-inject "중요: 인증은 JWT 사용" --importance 0.9
   ```

3. **동작**
   - 새 observation 생성 (type='note')
   - 현재 세션에 연결
   - 중요도 설정 (기본: 0.7)

4. **출력**
   ```
   ✅ 메모리에 추가됨

   ID: obs-xyz123
   내용: 이 프로젝트는 Express + Prisma 기반
   중요도: 0.7
   ```

## 인수 조건

- [x] 컨텍스트 저장 성공
- [x] 현재 세션에 연결
- [x] --importance 옵션 동작
- [x] 저장된 ID 반환
- [x] FTS 인덱스에 추가

## Evidence

[evidence.md](evidence.md)

## 검증 명령

```bash
bun test src/skills/__tests__/mem-inject.test.ts

# 테스트 케이스
# - 기본 주입
# - importance 옵션
# - 검색으로 조회 가능
```
