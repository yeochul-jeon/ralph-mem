# Issue #002: plugin.json 매니페스트 작성

> Phase 1: Core Layer | 의존성: #001

## 배경

Claude Code 플러그인으로 동작하려면 plugin.json 매니페스트 파일이 필요합니다.
이 파일은 플러그인의 메타데이터, hooks, skills를 정의합니다.

## 작업 내용

1. **plugin.json 생성**
   ```json
   {
     "name": "ralph-mem",
     "version": "0.1.0",
     "description": "Persistent context management with Ralph Loop",
     "main": "dist/index.js",
     "hooks": [...],
     "skills": [...]
   }
   ```

2. **Hooks 선언**
   - `SessionStart`
   - `SessionEnd`
   - `UserPromptSubmit`
   - `PostToolUse`

3. **Skills 선언**
   - `/ralph` - Ralph Loop 제어
   - `/mem-search` - 메모리 검색
   - `/mem-inject` - 수동 컨텍스트 주입
   - `/mem-forget` - 메모리 삭제
   - `/mem-status` - 상태 조회

4. **src/index.ts 엔트리포인트**
   - 플러그인 초기화 로직 스텁
   - hooks/skills export 구조

## 인수 조건

- [x] plugin.json이 유효한 JSON
- [x] 모든 hooks가 선언됨
- [x] 모든 skills가 선언됨
- [x] main 경로가 빌드 출력과 일치
- [x] src/index.ts가 플러그인 구조를 export

## 검증 명령

```bash
# JSON 유효성
cat plugin.json | jq .

# 필수 필드 존재
cat plugin.json | jq '.hooks | length'  # 4
cat plugin.json | jq '.skills | length' # 5

# 빌드 후 main 파일 존재
bun run build && ls dist/index.js
```

## 완료

- **완료일**: 2025-01-17
- **Evidence**: [evidence.md](./evidence.md)
