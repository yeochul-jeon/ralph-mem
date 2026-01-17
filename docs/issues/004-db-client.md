# Issue #004: DB 클라이언트 구현

> Phase 1: Core Layer | 의존성: #003

## 배경

SQLite 데이터베이스에 접근하기 위한 클라이언트가 필요합니다.
글로벌 DB와 프로젝트별 DB를 모두 지원해야 합니다.

## 작업 내용

1. **DB 클라이언트** (`src/core/db/client.ts`)
   ```typescript
   interface DBClient {
     // 연결
     connect(): Promise<void>;
     close(): Promise<void>;

     // Session CRUD
     createSession(data: CreateSession): Promise<Session>;
     getSession(id: string): Promise<Session | null>;
     updateSession(id: string, data: Partial<Session>): Promise<void>;
     listSessions(projectPath: string, limit?: number): Promise<Session[]>;

     // Observation CRUD
     createObservation(data: CreateObservation): Promise<Observation>;
     getObservation(id: string): Promise<Observation | null>;
     listObservations(sessionId: string): Promise<Observation[]>;
     deleteObservation(id: string): Promise<void>;

     // Loop CRUD
     createLoopRun(data: CreateLoopRun): Promise<LoopRun>;
     getLoopRun(id: string): Promise<LoopRun | null>;
     updateLoopRun(id: string, data: Partial<LoopRun>): Promise<void>;
   }
   ```

2. **DB 경로 관리**
   - 글로벌: `~/.config/ralph-mem/global.db`
   - 프로젝트: `.ralph-mem/memory.db`
   - 경로 생성 유틸리티

3. **연결 관리**
   - 싱글톤 패턴 또는 연결 풀
   - 자동 마이그레이션 실행
   - graceful shutdown

4. **ID 생성**
   - 세션: `sess-{nanoid}`
   - 관찰: `obs-{nanoid}`
   - 루프: `loop-{nanoid}`

## 인수 조건

- [ ] Session CRUD 동작
- [ ] Observation CRUD 동작
- [ ] LoopRun CRUD 동작
- [ ] 글로벌 DB 경로 정상 생성
- [ ] 프로젝트 DB 경로 정상 생성
- [ ] 연결/종료 정상 동작

## 검증 명령

```bash
bun test src/core/db/__tests__/client.test.ts

# 테스트 케이스
# - createSession → getSession 일치
# - createObservation → listObservations 포함
# - updateSession 반영 확인
# - deleteObservation 후 getObservation null
```
