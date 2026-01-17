# Issue #001: 프로젝트 구조 설정

> Phase 1: Core Layer | 의존성: 없음

## 배경

ralph-mem 플러그인 개발을 시작하기 위한 기본 프로젝트 구조가 필요합니다.
Bun 런타임, TypeScript, Vitest 테스트 프레임워크를 사용합니다.

## 작업 내용

1. **package.json 생성**
   - name: `ralph-mem`
   - type: `module`
   - scripts: `dev`, `build`, `test`, `lint`
   - dependencies: `better-sqlite3` (또는 bun:sqlite)
   - devDependencies: `typescript`, `vitest`, `@types/node`

2. **tsconfig.json 설정**
   - target: `ES2022`
   - module: `ESNext`
   - moduleResolution: `bundler`
   - strict: `true`
   - paths 설정 (`@/*` → `src/*`)

3. **디렉토리 구조 생성**
   ```
   src/
   ├── index.ts
   ├── core/
   │   ├── db/
   │   ├── store.ts
   │   └── search.ts
   ├── hooks/
   ├── features/
   │   └── ralph/
   ├── skills/
   └── utils/
   tests/
   prompts/
   ```

4. **vitest.config.ts 설정**
   - 테스트 환경 구성
   - coverage 설정

5. **.gitignore 업데이트**
   - node_modules, dist, coverage 추가

## 인수 조건

- [x] `bun install` 성공
- [x] `bun run build` 성공 (빈 프로젝트지만 에러 없음)
- [x] `bun test` 실행 가능 (vitest로 실행, todo 테스트 3개)
- [x] TypeScript 컴파일 에러 없음
- [x] 디렉토리 구조가 PRD와 일치

## 검증 명령

```bash
bun install
bun run build
bunx vitest run
bunx tsc --noEmit
```

## 완료

- **완료일**: 2025-01-17
- **Evidence**: [001-project-setup.md](../evidence/001-project-setup.md)
