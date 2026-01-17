# Issue #005: 설정 시스템 구현

> Phase 1: Core Layer | 의존성: #001

## 배경

글로벌 설정과 프로젝트별 설정을 관리하는 시스템이 필요합니다.
프로젝트 설정이 글로벌 설정을 오버라이드해야 합니다.

## 작업 내용

1. **설정 스키마** (`src/utils/config.ts`)
   ```typescript
   interface Config {
     ralph: {
       max_iterations: number;
       context_budget: number;
       cooldown_ms: number;
       success_criteria: SuccessCriteria[];
     };
     memory: {
       auto_inject: boolean;
       max_inject_tokens: number;
       retention_days: number;
     };
     search: {
       fts_first: boolean;
       embedding_fallback: boolean;
       default_limit: number;
     };
     privacy: {
       exclude_patterns: string[];
     };
     logging: {
       level: 'debug' | 'info' | 'warn' | 'error';
       file: boolean;
     };
   }
   ```

2. **설정 로더**
   - YAML 파일 파싱 (js-yaml 사용)
   - 글로벌 설정: `~/.config/ralph-mem/config.yaml`
   - 프로젝트 설정: `.ralph-mem/config.yaml`
   - 병합 로직: `deepMerge(defaults, global, project)`

3. **기본값 정의**
   - 모든 설정에 합리적인 기본값 제공

4. **설정 경로 생성**
   - 디렉토리 자동 생성
   - .gitignore 자동 추가

## 인수 조건

- [ ] 기본값만으로 정상 동작
- [ ] 글로벌 설정 로드 성공
- [ ] 프로젝트 설정이 글로벌 오버라이드
- [ ] 잘못된 YAML 시 에러 처리
- [ ] 설정 파일 없을 때 기본값 사용

## 검증 명령

```bash
bun test src/utils/__tests__/config.test.ts

# 테스트 케이스
# - 기본값 로드
# - 글로벌 설정 병합
# - 프로젝트 설정 오버라이드
# - 중첩 객체 병합 (deep merge)
# - 타입 검증
```
