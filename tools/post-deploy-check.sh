#!/bin/sh
# Post-deploy verification for ARBICOP. MANDATORY after every cPanel "Deploy HEAD Commit":
# .cpanel.yml overwrites the docroot .htaccess, which drops the cPanel MultiPHP handler block, so PHP can silently
# stop running (wrong version or source served as text).
#
#   sh tools/post-deploy-check.sh [BASE_URL] [--skip-tienda]       # default https://arbicop.com
#
# Needs only sh + curl (+ grep, awk, mktemp). Exit 0 = every check passed, 1 = at least one failed, 2 = usage/tooling.
# CURL_OPTS adds curl flags (e.g. CURL_OPTS=-k for a self-signed test host). --skip-tienda is for test accounts that
# have no WooCommerce shop installed; never use it on production.
BASE=https://arbicop.com
SKIP_TIENDA=0
for arg in "$@"; do
  case "$arg" in
    --skip-tienda) SKIP_TIENDA=1 ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) BASE=$arg ;;
  esac
done
BASE=${BASE%/}
command -v curl >/dev/null 2>&1 || { echo "curl is required"; exit 2; }
TMP=$(mktemp -d 2>/dev/null) || { echo "mktemp failed"; exit 2; }
trap 'rm -rf "$TMP"' EXIT INT TERM
FAILS=0
CODE=000
CTYPE=
pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s%s\n' "$1" "${2:+  -> $2}"; FAILS=$((FAILS + 1)); }

# fetch <path>: sets CODE and CTYPE; body in $TMP/body, response headers in $TMP/head
fetch() {
  : > "$TMP/body"; : > "$TMP/head"
  # shellcheck disable=SC2086
  # relative output names + cd: a native (Windows) curl cannot resolve a POSIX /tmp path when path conversion is off
  CODE=$(cd "$TMP" && curl -sS -L --max-time 30 $CURL_OPTS -o body -D head -w '%{http_code}' "$BASE$1" 2>err) || CODE=000
  CTYPE=$(tr -d '\r' < "$TMP/head" | awk 'tolower($1)=="content-type:" { $1=""; v=tolower($0) } END { print v }')
}
has_php_source() { grep -q '<?php' "$TMP/body"; }

echo "Post-deploy check: $BASE"

fetch /api/token.php
if [ "$CODE" = 200 ] && ! has_php_source && grep -q '"token"' "$TMP/body" && printf '%s' "$CTYPE" | grep -q 'json'; then
  pass "/api/token.php returns JSON (PHP is executing)"
else
  fail "/api/token.php returns JSON, not PHP source" "http $CODE, content-type:${CTYPE:- none}, $(has_php_source && echo 'body contains <?php' || echo "body: $(head -c 80 "$TMP/body" | tr '\n' ' ')")"
fi
PHPHDR=$(tr -d '\r' < "$TMP/head" | awk 'tolower($1)=="x-powered-by:" { $1=""; v=$0 } END { sub(/^ /, "", v); print v }')

fetch /libro-de-reclamaciones/
[ "$CODE" = 200 ] && ! has_php_source && pass "/libro-de-reclamaciones/ is 200" || fail "/libro-de-reclamaciones/ is 200 without <?php" "http $CODE"

if [ "$SKIP_TIENDA" = 1 ]; then
  echo "SKIP  /tienda/ (--skip-tienda)"
else
  fetch /tienda/
  [ "$CODE" = 200 ] && ! has_php_source && pass "/tienda/ is 200 and its HTML has no <?php" || fail "/tienda/ is 200 and its HTML has no <?php" "http $CODE$(has_php_source && echo ', contains <?php')"
fi

fetch /api/config.php
[ "$CODE" = 403 ] && pass "/api/config.php is 403" || fail "/api/config.php is 403" "http $CODE"
fetch /api/storage/
[ "$CODE" = 403 ] && pass "/api/storage/ is 403" || fail "/api/storage/ is 403" "http $CODE"

fetch /
if [ "$CODE" = 200 ] && printf '%s' "$CTYPE" | grep -q 'text/html'; then
  pass "/ is 200 text/html"
else
  fail "/ is 200 text/html" "http $CODE, content-type:${CTYPE:- none}"
fi

if [ -n "$PHPHDR" ]; then
  echo "INFO  PHP version header: X-Powered-By: $PHPHDR"
  VER=$(printf '%s' "$PHPHDR" | sed -n 's#.*PHP/\([0-9]*\)\.\([0-9]*\).*#\1\2#p')
  if [ -n "$VER" ] && { [ "$VER" -lt 81 ] || [ "$VER" -gt 84 ]; }; then
    fail "PHP version is 8.1 to 8.4" "reports $PHPHDR"
  fi
else
  echo "INFO  PHP version header not exposed (X-Powered-By absent)"
fi
echo "INFO  MultiPHP check needed: in cPanel > MultiPHP Manager confirm arbicop.com is still on the noted PHP 8.1-8.4 version (the deploy overwrote .htaccess; re-save the version if it changed)."

if [ "$FAILS" -gt 0 ]; then
  echo "RESULT: $FAILS check(s) FAILED. Do not consider the deploy good: fix MultiPHP/.htaccess or roll back (DEPLOY.md step 6)."
  exit 1
fi
echo "RESULT: all checks passed."
exit 0
