#!/bin/bash

# CodeMap MCP Server - End-to-End Test Script
# Usage: ./scripts/e2e-test.sh https://codemap-mcp.<account-id>.workers.dev YOUR_API_KEY

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVER_URL="${1:-http://localhost:8787}"
API_KEY="${2:-test-key}"
PROJECT_ID="e2e-test-project"
TEMP_DIR=$(mktemp -d)
TEST_COUNT=0
PASS_COUNT=0
FAIL_COUNT=0

# Cleanup
trap "rm -rf $TEMP_DIR" EXIT

# Helper functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[PASS]${NC} $1"
  ((PASS_COUNT++))
}

log_error() {
  echo -e "${RED}[FAIL]${NC} $1"
  ((FAIL_COUNT++))
}

log_warning() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

assert_status() {
  local response=$1
  local expected_status=$2
  local test_name=$3

  ((TEST_COUNT++))

  local status=$(echo "$response" | tail -n 1)

  if [ "$status" = "$expected_status" ]; then
    log_success "$test_name (HTTP $status)"
    return 0
  else
    log_error "$test_name (Expected: $expected_status, Got: $status)"
    return 1
  fi
}

assert_json_field() {
  local json=$1
  local field=$2
  local expected=$3
  local test_name=$4

  ((TEST_COUNT++))

  local value=$(echo "$json" | grep -o "\"$field\":[^,}]*" | cut -d: -f2- | tr -d ' "')

  if [ "$value" = "$expected" ]; then
    log_success "$test_name (field: $value)"
    return 0
  else
    log_error "$test_name (Expected: $expected, Got: $value)"
    return 1
  fi
}

create_test_codemap() {
  cat > "$TEMP_DIR/code_map.json" << 'EOF'
{
  "version": "1.0.0",
  "generated_at": "2024-12-17T10:00:00Z",
  "source_root": "/test/project",
  "symbols": [
    {
      "qualified_name": "auth.validate_user",
      "kind": "function",
      "file": "auth.py",
      "line": 10,
      "docstring": "Validate user credentials",
      "signature": "def validate_user(username: str, password: str) -> bool"
    },
    {
      "qualified_name": "auth.hash_password",
      "kind": "function",
      "file": "auth.py",
      "line": 20,
      "docstring": "Hash password",
      "signature": "def hash_password(password: str) -> str"
    },
    {
      "qualified_name": "app.login",
      "kind": "function",
      "file": "app.py",
      "line": 30,
      "docstring": "Handle login",
      "signature": "def login(username: str, password: str) -> bool"
    },
    {
      "qualified_name": "app.logout",
      "kind": "function",
      "file": "app.py",
      "line": 40,
      "docstring": "Handle logout",
      "signature": "def logout() -> None"
    },
    {
      "qualified_name": "api.verify_session",
      "kind": "function",
      "file": "api.py",
      "line": 50,
      "docstring": "Verify session",
      "signature": "def verify_session(token: str) -> bool"
    }
  ],
  "dependencies": [
    {
      "from": "app.login",
      "to": "auth.validate_user",
      "kind": "calls"
    },
    {
      "from": "app.login",
      "to": "auth.hash_password",
      "kind": "calls"
    },
    {
      "from": "api.verify_session",
      "to": "auth.validate_user",
      "kind": "calls"
    },
    {
      "from": "auth.validate_user",
      "to": "auth.hash_password",
      "kind": "calls"
    }
  ]
}
EOF
}

# Main test execution
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   CodeMap MCP Server - End-to-End Test Suite                 ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Server URL: ${YELLOW}$SERVER_URL${NC}"
echo -e "API Key: ${YELLOW}${API_KEY:0:10}...${NC}"
echo ""

# Test 1: Health Endpoint
echo -e "${BLUE}Test Suite 1: Health Checks${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

response=$(curl -s -w "\n%{http_code}" "$SERVER_URL/health")
body=$(echo "$response" | head -n 1)
assert_status "$response" "200" "GET /health returns 200"
assert_json_field "$body" "status" "healthy" "Health status is healthy"

# Test 2: Health Ready
response=$(curl -s -w "\n%{http_code}" "$SERVER_URL/health/ready")
body=$(echo "$response" | head -n 1)
assert_status "$response" "200" "GET /health/ready returns 200"
assert_json_field "$body" "status" "ready" "Ready status is ready"

echo ""
echo -e "${BLUE}Test Suite 2: MCP Protocol${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test 3: Initialize
response=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  "$SERVER_URL/mcp")
body=$(echo "$response" | head -n 1)
assert_status "$response" "200" "POST /mcp initialize returns 200"

# Test 4: Tools List
response=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  "$SERVER_URL/mcp")
body=$(echo "$response" | head -n 1)
assert_status "$response" "200" "POST /mcp tools/list returns 200"
echo "$body" | grep -q "get_dependents" && log_success "get_dependents tool listed" || log_error "get_dependents tool not found"
echo "$body" | grep -q "get_impact_report" && log_success "get_impact_report tool listed" || log_error "get_impact_report tool not found"
echo "$body" | grep -q "check_breaking_change" && log_success "check_breaking_change tool listed" || log_error "check_breaking_change tool not found"
echo "$body" | grep -q "get_architecture" && log_success "get_architecture tool listed" || log_error "get_architecture tool not found"

# Test 5: Resources List
response=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"resources/list","params":{}}' \
  "$SERVER_URL/mcp")
body=$(echo "$response" | head -n 1)
assert_status "$response" "200" "POST /mcp resources/list returns 200"
echo "$body" | grep -q "code_map" && log_success "code_map resource listed" || log_error "code_map resource not found"

# Test 6: Invalid Method
response=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":4,"method":"invalid_method","params":{}}' \
  "$SERVER_URL/mcp")
body=$(echo "$response" | head -n 1)
assert_status "$response" "200" "POST /mcp invalid method returns 200 (with error in body)"
echo "$body" | grep -q "error" && log_success "Error returned for invalid method" || log_error "No error returned for invalid method"

echo ""
echo -e "${BLUE}Test Suite 3: Project Upload${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create test CODE_MAP.json
create_test_codemap
log_info "Created test CODE_MAP.json with 5 symbols and 4 dependencies"

# Test 7: Upload Project
response=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d @"$TEMP_DIR/code_map.json" \
  "$SERVER_URL/projects/$PROJECT_ID/code_map")
body=$(echo "$response" | head -n 1)
assert_status "$response" "200" "POST /projects/:id/code_map returns 200"
assert_json_field "$body" "project_id" "$PROJECT_ID" "Project ID in response"

# Test 8: Get Project
response=$(curl -s -w "\n%{http_code}" -X GET \
  -H "Authorization: Bearer $API_KEY" \
  "$SERVER_URL/projects/$PROJECT_ID/code_map")
body=$(echo "$response" | head -n 1)
assert_status "$response" "200" "GET /projects/:id/code_map returns 200"

echo ""
echo -e "${BLUE}Test Suite 4: MCP Tools${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test 9: get_dependents
response=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":5,\"method\":\"tools/call\",\"params\":{\"name\":\"get_dependents\",\"arguments\":{\"project_id\":\"$PROJECT_ID\",\"symbol\":\"auth.validate_user\"}}}" \
  "$SERVER_URL/mcp")
body=$(echo "$response" | head -n 1)
assert_status "$response" "200" "POST /mcp tools/call get_dependents returns 200"
echo "$body" | grep -q "app.login" && log_success "get_dependents found app.login as dependent" || log_error "get_dependents did not find expected result"

# Test 10: get_impact_report
response=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":6,\"method\":\"tools/call\",\"params\":{\"name\":\"get_impact_report\",\"arguments\":{\"project_id\":\"$PROJECT_ID\",\"symbol\":\"auth.validate_user\"}}}" \
  "$SERVER_URL/mcp")
body=$(echo "$response" | head -n 1)
assert_status "$response" "200" "POST /mcp tools/call get_impact_report returns 200"
echo "$body" | grep -q "risk_score" && log_success "get_impact_report returned risk_score" || log_error "get_impact_report missing risk_score"

# Test 11: check_breaking_change
response=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":7,\"method\":\"tools/call\",\"params\":{\"name\":\"check_breaking_change\",\"arguments\":{\"project_id\":\"$PROJECT_ID\",\"symbol\":\"auth.validate_user\",\"new_signature\":\"def validate_user(username: str, password: str, mfa_code: str) -> bool\"}}}" \
  "$SERVER_URL/mcp")
body=$(echo "$response" | head -n 1)
assert_status "$response" "200" "POST /mcp tools/call check_breaking_change returns 200"
echo "$body" | grep -q "breaking_callers" && log_success "check_breaking_change returned breaking_callers" || log_error "check_breaking_change missing breaking_callers"

# Test 12: get_architecture
response=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":8,\"method\":\"tools/call\",\"params\":{\"name\":\"get_architecture\",\"arguments\":{\"project_id\":\"$PROJECT_ID\",\"detail_level\":\"overview\"}}}" \
  "$SERVER_URL/mcp")
body=$(echo "$response" | head -n 1)
assert_status "$response" "200" "POST /mcp tools/call get_architecture returns 200"
echo "$body" | grep -q "modules" && log_success "get_architecture returned modules" || log_error "get_architecture missing modules"

echo ""
echo -e "${BLUE}Test Suite 5: Error Handling${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test 13: Missing Project
response=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":9,\"method\":\"tools/call\",\"params\":{\"name\":\"get_dependents\",\"arguments\":{\"project_id\":\"nonexistent\",\"symbol\":\"some.symbol\"}}}" \
  "$SERVER_URL/mcp")
body=$(echo "$response" | head -n 1)
assert_status "$response" "200" "POST /mcp missing project returns 200 (with error)"
echo "$body" | grep -q "error" && log_success "Error returned for missing project" || log_error "No error for missing project"

# Test 14: Invalid JSON
response=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d 'invalid json' \
  "$SERVER_URL/mcp")
body=$(echo "$response" | head -n 1)
assert_status "$response" "400" "POST /mcp invalid JSON returns 400"

# Test 15: Missing Authorization
response=$(curl -s -w "\n%{http_code}" -X POST \
  "$SERVER_URL/projects/test/code_map" \
  -H "Content-Type: application/json" \
  -d @"$TEMP_DIR/code_map.json")
body=$(echo "$response" | head -n 1)
assert_status "$response" "401" "POST /projects/:id/code_map without auth returns 401"

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                         Test Summary                            ║"
echo "╠════════════════════════════════════════════════════════════════╣"
echo "│ Total Tests:  $TEST_COUNT"
echo "│ Passed:       ${GREEN}$PASS_COUNT${NC}"
echo "│ Failed:       ${RED}$FAIL_COUNT${NC}"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  exit 1
fi
