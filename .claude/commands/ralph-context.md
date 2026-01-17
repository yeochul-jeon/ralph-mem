# /ralph-context

ralph-mem 프로젝트의 설계 문서와 이슈를 조회하는 명령입니다.

## 사용법

```
/ralph-context              # 전체 인덱스 표시
/ralph-context 001          # 이슈 #001 상세 조회
/ralph-context hook         # 키워드로 관련 문서 검색
/ralph-context design       # 설계 문서 목록
/ralph-context issues       # 이슈 목록
```

## 실행 지침

사용자가 이 명령을 실행하면:

1. **인자 없음**: `docs/design/README.md`와 `docs/issues/README.md` 읽어서 요약 표시

2. **이슈 번호** (예: `001`, `#001`, `1`):
   - `docs/issues/001-*.md` 파일을 읽어서 전체 내용 표시
   - 의존성 이슈들도 간략히 언급

3. **키워드** (예: `hook`, `loop`, `store`):
   - `docs/design/*.md`와 `docs/issues/*.md`에서 키워드 검색
   - 관련 문서 목록과 해당 섹션 발췌 표시

4. **`design`**:
   - `docs/design/` 폴더의 모든 문서 목록
   - 각 문서의 첫 번째 설명 줄 포함

5. **`issues`**:
   - `docs/issues/` 폴더의 이슈 목록
   - Phase별로 그룹화하여 표시

## 출력 형식

```
📚 ralph-mem 컨텍스트

[조회 결과...]

---
💡 팁: 이슈 작업 시 해당 번호를 프롬프트에 포함하면 자동으로 컨텍스트가 주입됩니다.
예: "#001 프로젝트 설정 시작해줘"
```
