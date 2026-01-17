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

- [ ] `bun install` 성공
- [ ] `bun run build` 성공 (빈 프로젝트지만 에러 없음)
- [ ] `bun test` 실행 가능 (테스트 0개)
- [ ] TypeScript 컴파일 에러 없음
- [ ] 디렉토리 구조가 PRD와 일치

## 검증 명령

```bash
bun install
bun run build
bun test
bunx tsc --noEmit
```
