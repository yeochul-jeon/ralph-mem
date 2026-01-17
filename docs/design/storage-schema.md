# Storage Schema

> SQLite + FTS5 기반 저장소 스키마 설계

## 저장소 위치

| 유형 | 경로 | 용도 |
|------|------|------|
| 글로벌 | `~/.config/ralph-mem/` | 설정, 크로스 프로젝트 패턴 |
| 프로젝트 | `.ralph-mem/` | 프로젝트별 메모리, 스냅샷 |

### 디렉토리 구조

```
~/.config/ralph-mem/
├── config.yaml          # 글로벌 설정
├── global.db            # 크로스 프로젝트 메모리
└── backups/             # 글로벌 DB 백업

.ralph-mem/              # 프로젝트 루트
├── config.yaml          # 프로젝트 설정 (글로벌 오버라이드)
├── memory.db            # 프로젝트 메모리
├── snapshots/           # Loop 스냅샷
└── backups/             # 세션별 DB 백업
```

## 테이블 스키마

### sessions

세션 메타데이터 저장.

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  project_path TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  summary TEXT,
  summary_embedding BLOB,
  token_count INTEGER DEFAULT 0
);

CREATE INDEX idx_sessions_project ON sessions(project_path);
CREATE INDEX idx_sessions_started ON sessions(started_at);
```

### observations

도구 사용 기록 및 관찰.

```sql
CREATE TABLE observations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,           -- 'tool_use' | 'bash' | 'error' | 'success'
  tool_name TEXT,
  content TEXT NOT NULL,
  content_compressed TEXT,      -- 압축된 버전
  embedding BLOB,
  importance REAL DEFAULT 0.5,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX idx_obs_session ON observations(session_id);
CREATE INDEX idx_obs_type ON observations(type);
CREATE INDEX idx_obs_created ON observations(created_at);
```

### observations_fts

FTS5 전문 검색 인덱스.

```sql
CREATE VIRTUAL TABLE observations_fts USING fts5(
  content,
  tool_name,
  content='observations',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);

-- 트리거: observations 변경 시 FTS 동기화
CREATE TRIGGER obs_ai AFTER INSERT ON observations BEGIN
  INSERT INTO observations_fts(rowid, content, tool_name)
  VALUES (new.rowid, new.content, new.tool_name);
END;
```

### loop_runs

Ralph Loop 실행 기록.

```sql
CREATE TABLE loop_runs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  task TEXT NOT NULL,
  criteria TEXT NOT NULL,       -- JSON: 성공 기준
  status TEXT NOT NULL,         -- 'running' | 'success' | 'failed' | 'stopped'
  iterations INTEGER DEFAULT 0,
  max_iterations INTEGER DEFAULT 10,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  snapshot_path TEXT,           -- 스냅샷 디렉토리
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

### global_patterns

크로스 프로젝트 패턴 (글로벌 DB).

```sql
CREATE TABLE global_patterns (
  id TEXT PRIMARY KEY,
  pattern_type TEXT NOT NULL,   -- 'error_fix' | 'best_practice' | 'tool_usage'
  description TEXT NOT NULL,
  embedding BLOB,
  source_projects TEXT,         -- JSON: 발견된 프로젝트들
  frequency INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

## 백업 전략

| 시점 | 동작 |
|------|------|
| 세션 시작 | 이전 DB를 `backups/YYYYMMDD_HHMMSS.db`로 복사 |
| 세션 종료 | 백업 유지 (실패 시 복원용) |
| 7일 경과 | 오래된 백업 자동 삭제 |

## .gitignore 자동 추가

프로젝트 초기화 시 `.gitignore`에 자동 추가:

```gitignore
# ralph-mem
.ralph-mem/
```
