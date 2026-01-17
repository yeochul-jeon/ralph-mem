#!/bin/bash
# UserPromptSubmit hook: 프롬프트에서 이슈 번호나 키워드를 감지하여 관련 컨텍스트 출력

PROMPT="$1"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

DESIGN_DIR="$PROJECT_ROOT/docs/design"
ISSUES_DIR="$PROJECT_ROOT/docs/issues"

# 이슈 번호 감지 (#001, #002, issue 001, 등)
detect_issues() {
    echo "$PROMPT" | grep -oE '#?0?[0-9]{2,3}' | sed 's/#//' | sed 's/^0*//' | sort -u
}

# 키워드로 관련 문서 찾기
find_related_docs() {
    local keywords="$1"

    # 설계 문서에서 검색
    if [ -d "$DESIGN_DIR" ]; then
        grep -l -i "$keywords" "$DESIGN_DIR"/*.md 2>/dev/null | head -3
    fi

    # 이슈 문서에서 검색 (폴더 구조)
    if [ -d "$ISSUES_DIR" ]; then
        grep -rl -i "$keywords" "$ISSUES_DIR"/*/README.md 2>/dev/null | head -5
    fi
}

# 주요 키워드 추출 (간단한 버전)
extract_keywords() {
    echo "$PROMPT" | tr '[:upper:]' '[:lower:]' | \
        grep -oE '\b(hook|loop|store|search|session|config|memory|embed|compress|skill|ralph|fts|sqlite|criteria)\b' | \
        sort -u | tr '\n' '|' | sed 's/|$//'
}

# 결과 출력
output=""

# 1. 명시적 이슈 번호 감지
issues=$(detect_issues)
if [ -n "$issues" ]; then
    for num in $issues; do
        padded=$(printf "%03d" "$num")
        issue_dir=$(ls -d "$ISSUES_DIR"/${padded}-* 2>/dev/null | head -1)
        if [ -d "$issue_dir" ]; then
            dirname=$(basename "$issue_dir")
            output="$output\n📋 Issue #$padded: $dirname/"
        fi
    done
fi

# 2. 키워드 기반 관련 문서 검색
keywords=$(extract_keywords)
if [ -n "$keywords" ]; then
    # 설계 문서
    design_matches=$(grep -l -iE "$keywords" "$DESIGN_DIR"/*.md 2>/dev/null | head -2)
    for doc in $design_matches; do
        if [ -f "$doc" ]; then
            filename=$(basename "$doc")
            output="$output\n📐 Design: $filename"
        fi
    done

    # 이슈 문서 (폴더 구조, 명시적으로 지정되지 않은 것만)
    issue_matches=$(grep -rl -iE "$keywords" "$ISSUES_DIR"/[0-9]*/README.md 2>/dev/null | head -3)
    for doc in $issue_matches; do
        if [ -f "$doc" ]; then
            dirname=$(basename "$(dirname "$doc")")
            # 이미 명시적으로 언급된 이슈는 제외
            num=$(echo "$dirname" | grep -oE '^[0-9]+')
            if ! echo "$issues" | grep -q "^$((10#$num))$"; then
                output="$output\n📝 Related: $dirname/"
            fi
        fi
    done
fi

# 출력이 있으면 표시
if [ -n "$output" ]; then
    echo -e "\n<ralph-context>"
    echo -e "🔍 관련 컨텍스트 감지:$output"
    echo -e "\n상세 조회: /ralph-context [issue#|keyword]"
    echo -e "</ralph-context>\n"
fi
