#!/usr/bin/env bash

set -euo pipefail

API_BASE_URL="${BASMA_API_URL:-https://basma-api.brainsait.org}"
VOICE_BASE_URL="${BASMA_VOICE_URL:-https://basma-voice.brainsait.org}"
ALLOW_WRITE_SMOKE="${ALLOW_WRITE_SMOKE:-0}"

pass() {
  printf 'PASS: %s\n' "$1"
}

fail() {
  printf 'FAIL: %s\n' "$1"
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

require_cmd curl
require_cmd python3

json_get() {
  local field="$1"
  python3 -c '
import json
import sys
field = sys.argv[1]
try:
    data = json.loads(sys.stdin.read())
except Exception:
    print('')
    sys.exit(0)
print(data.get(field, ''))
' "$field"
}

http_json_get() {
  local url="$1"
  curl -sS --fail "$url"
}

echo "Running Basma smoke tests"
echo "API:   $API_BASE_URL"
echo "Voice: $VOICE_BASE_URL"

health_payload="$(http_json_get "$API_BASE_URL/health")"
health_status="$(printf '%s' "$health_payload" | json_get status)"
[[ "$health_status" == "operational" ]] && pass "API /health is operational" || fail "API /health not operational"

voice_health_payload="$(http_json_get "$VOICE_BASE_URL/health")"
voice_health_status="$(printf '%s' "$voice_health_payload" | json_get status)"
[[ "$voice_health_status" == "operational" ]] && pass "Voice /health is operational" || fail "Voice /health not operational"

manifest_payload="$(http_json_get "$API_BASE_URL/public/manifest")"
platform_name="$(printf '%s' "$manifest_payload" | json_get platform)"
[[ -n "$platform_name" ]] && pass "Public manifest is available" || fail "Public manifest missing platform"

availability_payload="$(http_json_get "$API_BASE_URL/public/availability?limit=2")"
slots_present="$(printf '%s' "$availability_payload" | python3 -c '
import json
import sys
try:
  data = json.loads(sys.stdin.read())
  slots = data.get("slots", [])
  print("yes" if isinstance(slots, list) and len(slots) >= 1 else "no")
except Exception:
  print("no")
')"
[[ "$slots_present" == "yes" ]] && pass "Availability returns at least one slot" || fail "Availability has no slots"

if [[ "$ALLOW_WRITE_SMOKE" == "1" ]]; then
  intake_payload='{
    "name": "Smoke Test Lead",
    "phone": "+966500000001",
    "email": "smoketest@brainsait.org",
    "company": "BrainSAIT QA",
    "inquiryType": "consultation",
    "channel": "web_widget",
    "source": "smoke_test"
  }'

  intake_response="$(curl -sS --fail -X POST "$API_BASE_URL/public/intake" -H "Content-Type: application/json" -d "$intake_payload")"
  intake_id="$(printf '%s' "$intake_response" | json_get id)"
  [[ -n "$intake_id" ]] && pass "Public intake created lead record" || fail "Public intake did not return an id"
else
  pass "Skipped write smoke test (set ALLOW_WRITE_SMOKE=1 to enable)"
fi

echo "All smoke tests passed"
