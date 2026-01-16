# ralph-mem 태스크 리스트

> PRD의 구현 태스크를 추적합니다. 완료된 항목은 `[x]`로 표시합니다.

## Phase 1: Foundation

- [ ] 프로젝트 구조 설정 (Bun, TypeScript, Vitest)
- [ ] plugin.json 매니페스트 작성
- [ ] SQLite 스키마 정의 및 마이그레이션 시스템
- [ ] DB 클라이언트 구현
- [ ] 기본 설정 관리 (config.ts)
- [ ] SessionStart hook 구현
- [ ] SessionEnd hook 구현
- [ ] `/mem-search` skill 구현 (Layer 1)

## Phase 2: Ralph Loop

- [ ] Loop Engine 기본 구조
- [ ] Success Criteria 평가기 (test_pass, build_success)
- [ ] Success Criteria 확장 (lint_clean, type_check, custom)
- [ ] Context Manager 구현
- [ ] Loop 상태 관리 (running, success, failed, stopped)
- [ ] `/ralph start` 명령 구현
- [ ] `/ralph stop` 명령 구현
- [ ] `/ralph status` 명령 구현
- [ ] LoopIteration hook 구현

## Phase 3: Intelligence

- [ ] AI 기반 컨텍스트 압축 (compressor.ts)
- [ ] 압축용 프롬프트 작성 (prompts/compressor.md)
- [ ] FTS5 전문 검색 최적화
- [ ] Progressive Disclosure 구현 (Layer 2, 3)
- [ ] 세션 요약 자동 생성
- [ ] UserPromptSubmit hook 구현
- [ ] PostToolUse hook 구현
- [ ] 토큰 계산 유틸리티 (tokens.ts)

## Phase 4: Polish

- [ ] 단위 테스트 작성 (loop.test.ts)
- [ ] 단위 테스트 작성 (memory.test.ts)
- [ ] 단위 테스트 작성 (hooks.test.ts)
- [ ] 통합 테스트 작성
- [ ] 테스트 커버리지 80% 달성
- [ ] `/mem-inject` skill 구현
- [ ] `/mem-forget` skill 구현
- [ ] `/mem-status` skill 구현
- [ ] `/ralph config` 명령 구현
- [ ] 성능 최적화 (검색 응답 < 200ms)
- [ ] 에러 핸들링 및 graceful degradation
- [ ] 문서화 (ARCHITECTURE.md)
