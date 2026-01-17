# Issue #010: PostToolUse Hook 구현

> Phase 2: Hook Layer | 의존성: #006

## 배경

도구 사용 후 자동으로 실행되는 hook이 필요합니다.
쓰기 도구와 Bash 명령의 결과를 메모리에 기록합니다.

## 작업 내용

1. **PostToolUse Hook** (`src/hooks/post-tool-use.ts`)
   ```typescript
   interface PostToolUseHook {
     execute(context: ToolUseContext): Promise<void>;
   }

   interface ToolUseContext {
     toolName: string;
     input: Record<string, unknown>;
     output: string;
     success: boolean;
     error?: string;
   }
   ```

2. **기록 대상 필터링**
   | 도구 유형 | 기록 | 이유 |
   |----------|------|------|
   | Edit, Write | ✅ | 코드 변경 추적 |
   | Bash | ✅ | 명령 실행 결과 |
   | Read, Glob, Grep | ❌ | 읽기 전용 |

3. **Observation 생성**
   ```typescript
   {
     type: 'tool_use' | 'bash' | 'error' | 'success',
     tool_name: toolName,
     content: formatOutput(output),
     importance: calculateImportance(context)
   }
   ```

4. **중요도 계산**
   - 에러 발생: 1.0
   - 테스트 결과: 0.9
   - 파일 수정: 0.7
   - 일반 명령: 0.5

5. **Privacy 필터**
   - exclude_patterns 매칭 시 기록 제외
   - 민감 정보 마스킹

## 인수 조건

- [ ] Edit/Write 도구 결과 기록
- [ ] Bash 명령 결과 기록
- [ ] Read/Glob/Grep 결과 기록 안 함
- [ ] 에러 시 type='error'로 기록
- [ ] 중요도 정확히 계산
- [ ] exclude_patterns 동작

## 검증 명령

```bash
bun test src/hooks/__tests__/post-tool-use.test.ts

# 테스트 케이스
# - Edit 도구 → observation 생성
# - Bash 성공 → type='bash'
# - Bash 실패 → type='error'
# - Read 도구 → observation 미생성
# - 민감 정보 필터링
```
