# Error Handling

> 에러 처리 전략

## 에러 심각도

### 3단계 분류

| 레벨 | 심각도 | 예시 | 동작 |
|------|--------|------|------|
| Low | 낮음 | 임베딩 생성 실패 | 로그만, 계속 진행 |
| Medium | 중간 | FTS5 검색 실패 | 폴백 시도 후 알림 |
| High | 높음 | DB 연결 실패 | 즉시 알림, 사용자 선택 |

### 레벨별 처리

```typescript
type ErrorLevel = 'low' | 'medium' | 'high';

interface ErrorHandler {
  level: ErrorLevel;
  handle(error: Error): Promise<ErrorResult>;
}

// Low: 로그만
const lowHandler: ErrorHandler = {
  level: 'low',
  async handle(error) {
    logger.warn('Non-critical error', { error });
    return { action: 'continue' };
  }
};

// Medium: 폴백 시도
const mediumHandler: ErrorHandler = {
  level: 'medium',
  async handle(error) {
    logger.error('Recoverable error', { error });
    const fallback = await tryFallback(error);
    if (fallback.success) {
      return { action: 'continue', result: fallback.result };
    }
    await notify(`⚠️ ${error.message} (폴백 실패)`);
    return { action: 'continue_degraded' };
  }
};

// High: 사용자 선택
const highHandler: ErrorHandler = {
  level: 'high',
  async handle(error) {
    logger.error('Critical error', { error });
    const choice = await askUser({
      message: `❌ ${error.message}`,
      options: ['재시도', '무시하고 계속', '중단']
    });
    return { action: choice };
  }
};
```

## Graceful Degradation

### 사용자 선택 기반

심각한 에러 발생 시 사용자에게 선택권 제공:

```
❌ 데이터베이스 연결 실패

선택:
  [1] 재시도
  [2] 메모리 기능 없이 계속
  [3] 세션 중단

선택: _
```

### 기능별 폴백

| 기능 | 에러 | 폴백 동작 |
|------|------|----------|
| Embedding 생성 | 모델 로드 실패 | FTS5만 사용 |
| FTS5 검색 | 인덱스 손상 | 전체 스캔 |
| DB 쓰기 | 디스크 풀 | 메모리 큐 저장 |
| 세션 요약 | Claude API 실패 | 수동 요약 건너뛰기 |

### 폴백 알림

```
⚠️ 임베딩 모델 로드 실패
└─ 폴백: FTS5 전문 검색만 사용합니다.
   의미 기반 검색이 제한됩니다.
```

## 로깅

### 로깅 레벨

| 레벨 | 내용 | 기본 활성화 |
|------|------|------------|
| Debug | 상세 디버깅 정보 | ❌ |
| Info | 일반 작업 정보 | ✅ |
| Warn | 경고 (Low 에러) | ✅ |
| Error | 에러 (Medium/High) | ✅ |

### 로그 위치

```
~/.config/ralph-mem/logs/
├── ralph-mem.log      # 현재 로그
└── ralph-mem.1.log    # 로테이션된 로그
```

### 로그 형식

```
[2025-01-15T10:30:00.000Z] [INFO] Session started: sess-abc123
[2025-01-15T10:30:01.000Z] [WARN] Embedding generation slow: 2500ms
[2025-01-15T10:30:05.000Z] [ERROR] FTS5 search failed: SQLITE_CORRUPT
```

## Ralph Loop 에러

### 테스트 실행 실패

```typescript
async function runTest(command: string): Promise<TestResult> {
  try {
    const output = await exec(command);
    return { success: true, output };
  } catch (error) {
    // 테스트 실패는 에러가 아님 (정상 플로우)
    if (error.code === 1) {
      return { success: false, output: error.stdout };
    }
    // 명령어 자체 실행 실패
    throw new LoopError('test_command_failed', error.message);
  }
}
```

### Loop 에러 처리

```
❌ Loop 에러: 테스트 명령어 실행 실패

원인: Command not found: npm
해결:
  1. npm이 설치되어 있는지 확인
  2. 테스트 명령어 수정: /ralph config

Loop가 중단되었습니다.
```

## 데이터 복구

### DB 손상 시

```typescript
async function recoverDatabase(): Promise<void> {
  const backups = await listBackups();
  if (backups.length === 0) {
    throw new Error('No backups available');
  }

  const choice = await askUser({
    message: '💾 데이터베이스 손상 감지',
    options: backups.map(b => `${b.date} (${b.size})`).concat(['새로 시작'])
  });

  if (choice !== '새로 시작') {
    await restoreBackup(backups[choice]);
  } else {
    await initDatabase();
  }
}
```
