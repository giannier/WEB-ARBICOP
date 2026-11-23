#!/bin/bash
# Runs every deploy scenario against the two simulated cPanel accounts and writes docker/deploy-test/results.md.
#   docker compose -f docker-compose.deploy-test.yml -p arbicop-deploytest up -d --build
#   bash docker/deploy-test/run.sh
# Needs: bash (Git Bash is fine), docker, curl. Only the named volumes of the deploy-test project are modified.
cd "$(dirname "$0")/../.." || exit 1
export MSYS_NO_PATHCONV=1
DC="docker compose -f docker-compose.deploy-test.yml -p arbicop-deploytest"
OUT=docker/deploy-test/results.md
TSV=$(mktemp)
SC=""
DOC=/home/arbicopc/public_html
REPO=/home/arbicopc/repos/WEB-ARBICOP

# ---------------------------------------------------------------- plumbing
svc=web-stale; PORT=8090
use() { svc=$1; PORT=$2; }
dx()  { $DC exec -T "$svc" "$@"; }                       # as root
du_() { $DC exec -T -u arbicopc "$svc" "$@"; }           # as the cPanel user
rec() { printf '%s\t%s\t%s\t%s\n' "$SC" "$2" "$1" "${3:-}" >> "$TSV"; printf '%-5s [%s] %s %s\n' "$1" "$SC" "$2" "${3:+-> $3}"; }
ok()  { if [ "$1" = 0 ]; then rec PASS "$2" "${3:-}"; else rec FAIL "$2" "${3:-}"; fi; }   # ok <exit-status> <name> [detail]
U() { echo "http://localhost:$PORT$1"; }
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 25 "$@"; }
body() { curl -s --max-time 25 "$@"; }
want_code() { local got; got=$(code "${@:3}" "$(U "$2")"); [ "$got" = "$1" ] && rec PASS "GET $2 ${*:3} -> $1" || rec FAIL "GET $2 ${*:3} -> $1" "got $got"; }
want_body() { local b; b=$(body "${@:3}" "$(U "$2")"); if echo "$b" | grep -Eq "$1"; then rec PASS "GET $2 ${*:3} body ~ $1"; else rec FAIL "GET $2 ${*:3} body ~ $1" "$(echo "$b" | head -c 120)"; fi; }
not_body() { local b; b=$(body "${@:3}" "$(U "$2")"); if echo "$b" | grep -Eq "$1"; then rec FAIL "GET $2 ${*:3} body !~ $1" "$(echo "$b" | head -c 120)"; else rec PASS "GET $2 ${*:3} body !~ $1"; fi; }
want_loc() { local h; h=$(curl -s -o /dev/null -D - --max-time 25 "${@:3}" "$(U "$2")" | tr -d '\r'); if echo "$h" | grep -Eqi "^location: ($1)\$"; then rec PASS "GET $2 ${*:3} Location: $1"; else rec FAIL "GET $2 ${*:3} Location: $1" "$(echo "$h" | head -3 | tr '\n' '|')"; fi; }
sameas() { if curl -s --max-time 25 "$(U "$1")" | cmp -s - "$2"; then rec PASS "GET $1 identical to $2"; else rec FAIL "GET $1 identical to $2"; fi; }

seed()   { dx sh /dt/seed.sh "$1" 2>&1 | tail -1; }
deploy() { du_ bash /dt/cpanel-run.sh > /tmp/deploy.out 2>&1; DEPLOY_RC=$?; sed 's/^/      | /' /tmp/deploy.out | cut -c1-200; }
block()  { du_ bash /dt/run-block.sh "$1" > "/tmp/block-$1.out" 2>&1; BLOCK_RC=$?; sed 's/^/      | /' "/tmp/block-$1.out" | cut -c1-200; }
tienda_hash() { dx sh -c "cd $DOC/tienda && find . -type f ! -name arbicop-shared-header.php ! -name arbicop-shared-header.css ! -name arbicop-shop-cart.php | sort | xargs sha256sum | sha256sum | cut -c1-64"; }
state_hash() { dx sh -c "cd $DOC/api && { find storage -type f ! -name .gitignore ! -name .htaccess | sort | xargs -r sha256sum; [ -f config.secret.php ] && sha256sum config.secret.php; } | sha256sum | cut -c1-64"; }
top() { dx sh -c "cd $DOC && ls -A | sort | tr '\n' ' '"; }

# Submit one dry-run claim; sets CLAIM_NO and CLAIM_URL, prints nothing.
claim() {
  local jar tok resp
  jar=$(mktemp); tok=$(curl -s -c "$jar" -b "$jar" "$(U /api/token.php)" | sed 's/.*"token":"\([0-9a-f]*\)".*/\1/')
  sleep 3
  resp=$(curl -s -c "$jar" -b "$jar" -H "Origin: http://localhost:$PORT" -H "Referer: http://localhost:$PORT/libro-de-reclamaciones/" \
    -X POST "$(U /api/reclamo.php)" \
    --data-urlencode "token=$tok" --data-urlencode "website_alt=" --data-urlencode "nombres=Maria Jose" --data-urlencode "paterno=Quispe" \
    --data-urlencode "materno=Nahui" --data-urlencode "tipo_doc=DNI" --data-urlencode "nro_doc=12345678" --data-urlencode "cel=943 704 298" \
    --data-urlencode "dep=AMAZONAS" --data-urlencode "prov=CHACHAPOYAS" --data-urlencode "dist=CHACHAPOYAS" \
    --data-urlencode "direccion=Jr. Amazonas 123" --data-urlencode "referencia=Frente al parque" --data-urlencode "correo=maria.quispe@example.com" \
    --data-urlencode "flag_menor=0" --data-urlencode "tipo_reclamo=Reclamo" --data-urlencode "tipo_consumo=Servicio" --data-urlencode "nro_pedido=P-0001" \
    --data-urlencode "monto_reclamado=150.50" --data-urlencode "descripcion=Curso de arbitraje modulo I" \
    --data-urlencode "fch_compra=2026-10-01" --data-urlencode "fch_consumo=2026-10-05" --data-urlencode "fch_vencimiento=" \
    --data-urlencode "detalle_reclamo=No recibi el acceso al aula virtual pese a haber pagado el curso completo (prueba $RANDOM$RANDOM del simulacro de despliegue)." \
    --data-urlencode "pedido_cliente=Solicito el acceso inmediato." --data-urlencode "acepto=1" --data-urlencode "politica=1")
  rm -f "$jar"
  CLAIM_NO=$(echo "$resp" | grep -o 'LR-[0-9]\{4\}-[0-9]\{4\}' | head -1)
  CLAIM_URL=$(echo "$resp" | grep -o '"download_url":"[^"]*"' | head -1 | sed 's/"download_url":"//; s/"$//; s#\\/#/#g; s/\\u0026/\&/g')
  CLAIM_RESP=$resp
}

# tools/post-deploy-check.sh (the MANDATORY step after every Deploy HEAD Commit) run against the simulated site.
# Its non-zero exit is a FAIL. POSTCHECK_ARGS: accounts without a shop pass --skip-tienda (the stub is absent there).
POSTCHECK_ARGS=""
post_check() {
  local out rc
  out=$(sh tools/post-deploy-check.sh "http://localhost:$PORT" $POSTCHECK_ARGS 2>&1); rc=$?
  echo "$out" | sed 's/^/      | /' | cut -c1-200
  [ $rc = 0 ] && rec PASS "tools/post-deploy-check.sh exit 0" || rec FAIL "tools/post-deploy-check.sh exit 0" "exit $rc: $(echo "$out" | grep '^FAIL' | head -2 | tr '
' '|')"
}

# Static-site smoke test (everything that must be true once dist/ is live)
smoke_site() {
  local p h
  want_code 200 /
  sameas / dist/index.html
  not_body 'LEGACY-WP|TIENDA-STUB' /
  for d in dist/*/; do p=$(basename "$d"); [ "$p" = api ] || [ "$p" = assets ] || sameas "/$p/" "dist/$p/index.html"; done
  # every /assets/... URL referenced by the home page answers 200
  local bad=0 n=0
  for a in $(body "$(U /)" | grep -o '/assets/[^"'"'"' )?]*' | sort -u); do n=$((n+1)); [ "$(code "$(U "$a")")" = 200 ] || { bad=$((bad+1)); echo "      missing asset $a"; }; done
  [ $bad = 0 ] && rec PASS "all $n /assets/ URLs referenced by / return 200" || rec FAIL "assets referenced by / return 200" "$bad of $n missing"
  want_code 200 /assets/data/ubigeo.json; want_code 200 /assets/js/libro.js
  want_code 200 /robots.txt; want_code 200 /sitemap.xml; want_code 200 /favicon.ico
  want_code 404 /no-existe/
  want_body "$(grep -o '<title>[^<]*' dist/404.html | head -1 | sed 's/<title>//' | cut -c1-30 | sed 's/[][\.*^$()+?{|]/\\&/g')" /no-existe/
  want_loc '(http://localhost:'"$PORT"')?/libro-de-reclamaciones/' /libro-de-reclamaciones-2/
  want_code 301 /libro-de-reclamaciones-2/
  want_code 301 /index.html; want_loc '(http://localhost:'"$PORT"')?/' /index.html
  want_code 301 /nosotros/index.html
  # HTTPS-redirect guard: localhost (and 127.0.0.1) stay on http, a public host is redirected unless proxied as https
  want_code 200 /                                          # Host: localhost
  want_code 200 / -H "Host: 127.0.0.1:$PORT"
  want_code 301 / -H "Host: arbicop.com"
  want_loc 'https://arbicop.com/' / -H "Host: arbicop.com"
  want_code 200 / -H "Host: arbicop.com" -H "X-Forwarded-Proto: https"
  # denied paths
  for x in /api/config.php /api/config.secret.php /api/config.secret.example.php /api/storage/ /api/storage/counter.dat /api/src/Security.php /api/lib/ /api/tools/ /api/fonts/ /api/assets/logo.png /api/README.md; do want_code 403 "$x"; done
  want_code 403 /.htaccess
  # libro: page, token and a dry-run claim + PDF download
  want_code 200 /libro-de-reclamaciones/
  want_body '^\{.*"token":"[0-9a-f]{64}"' /api/token.php
  claim
  [ -n "$CLAIM_NO" ] && rec PASS "dry-run claim accepted -> $CLAIM_NO" || rec FAIL "dry-run claim accepted" "$(echo "$CLAIM_RESP" | head -c 200)"
  if [ -n "$CLAIM_URL" ]; then
    h=$(curl -s -o ./docker/deploy-test/.hoja.tmp -w '%{http_code} %{content_type}' --max-time 25 "$(U "$CLAIM_URL")")
    if head -c 4 ./docker/deploy-test/.hoja.tmp | grep -q '%PDF'; then rec PASS "PDF download for $CLAIM_NO is a PDF"; else rec FAIL "PDF download for $CLAIM_NO is a PDF" "$h"; fi
  else rec FAIL "claim response carries download_url"; fi
  dx sh -c "ls $DOC/api/storage/hojas/*/$CLAIM_NO.pdf $DOC/api/storage/correo/$CLAIM_NO-empresa.eml >/dev/null 2>&1"; ok $? "$CLAIM_NO archived (pdf) + dry-run .eml written under api/storage"
  post_check
}

# deployed tree == dist/ (optionally ignoring the .htaccess, which postdeploy appends to)
tree_matches_dist() {
  local skip=${1:-no} out
  out=$(du_ sh -c "cd $REPO/dist && find . -type f $( [ "$skip" = skip-htaccess ] && echo "! -path ./.htaccess" ) | sort | while read -r f; do cmp -s \"\$f\" \"$DOC/\$f\" || echo \"DIFF \$f\"; done")
  [ -z "$out" ] && rec PASS "every file of dist/ is present in the docroot, byte-identical" || rec FAIL "dist/ == docroot" "$(echo "$out" | head -3 | tr '\n' '|')"
}

# Shop must be intact: tracked sample files unchanged and the 3 custom files installed identical to the repo
shop_intact() {
  local before=$1 after
  after=$(tienda_hash); [ "$before" = "$after" ] && rec PASS "tienda/ untouched byte-for-byte (all files except the 3 custom mu-plugins) sha=${after:0:12}" || rec FAIL "tienda/ untouched" "$before != $after"
  for f in arbicop-shared-header.php arbicop-shared-header.css arbicop-shop-cart.php; do
    dx cmp -s "$DOC/tienda/wp-content/mu-plugins/$f" "/repo-src/tienda/wp-content/mu-plugins/$f"; ok $? "tienda/wp-content/mu-plugins/$f installed, identical to repo"
  done
  want_body 'TIENDA-STUB uri=/tienda/' /tienda/
  want_body 'TIENDA-STUB uri=/tienda/producto-x/' /tienda/producto-x/        # shop's own rewrite -> its index.php
  want_code 200 /tienda/wp-content/uploads/2026/01/product.png
}

# ================================================================================================================
echo "== preflight"
$DC ps --format '{{.Name}} {{.Status}}' | sed 's/^/   /'
python -I tools/check-cpanel-yml.py > /tmp/yml.out 2>&1; YML_RC=$?; tail -1 /tmp/yml.out

# ------------------------------------------------------------------ (a) clean account
SC="a-clean-empty-docroot"; use web-clean 8092
echo "== $SC"; seed clean
tail -3 <(dx cat /tmp/seed.info)
TD=$(dx cat /tmp/seed.info | sed -n 's/tracked_dist_files=//p'); DD=$(dx cat /tmp/seed.info | sed -n 's/disk_dist_files=//p')
[ "$TD" = "$DD" ] && [ "$TD" -gt 0 ] && rec PASS "git clone carries the whole dist/ ($TD tracked == $DD on disk): .gitignore drops nothing from dist/" || rec FAIL "git tracks all of dist/" "tracked=$TD disk=$DD"
[ "$YML_RC" = 0 ] && rec PASS ".cpanel.yml parses + paths exist (tools/check-cpanel-yml.py)" || rec FAIL ".cpanel.yml check" "$(tail -3 /tmp/yml.out)"
deploy
[ "$DEPLOY_RC" != 0 ] && grep -q 'task 2' /tmp/deploy.out && rec PASS "no shop on the account: task 1 (site) copied, task 2 fails visibly (no mkdir by design), exit $DEPLOY_RC" || rec FAIL "expected failure at task 2 when /tienda/ is absent" "rc=$DEPLOY_RC"
grep -q '\[task 1\]' /tmp/deploy.out && ! grep -q 'task 1\] FAILED' /tmp/deploy.out; ok $? "task 1 (dist/. -> docroot) succeeded"
tree_matches_dist
POSTCHECK_ARGS="--skip-tienda"   # clean account: no shop installed on purpose
smoke_site
POSTCHECK_ARGS=""
want_code 404 /tienda/
SC="a2-clean-with-shop-skeleton"
echo "== $SC"; seed clean-shop; deploy
ok $DEPLOY_RC "all 4 tasks succeed when tienda/wp-content/mu-plugins/ exists (rc=$DEPLOY_RC)"
for f in arbicop-shared-header.php arbicop-shared-header.css arbicop-shop-cart.php; do dx cmp -s "$DOC/tienda/wp-content/mu-plugins/$f" "/repo-src/tienda/wp-content/mu-plugins/$f"; ok $? "mu-plugins/$f installed"; done
tree_matches_dist
dx sh -c "test ! -e $DOC/api/config.secret.php"; ok $? "no config.secret.php was created by the deploy"

# ------------------------------------------------------------------ (b) stale account, NO cutover
SC="b-stale-no-cutover"; use web-stale 8090
echo "== $SC"; seed stale
TH=$(tienda_hash); WK=$(dx cat $DOC/.well-known/acme-challenge/TESTTOKEN123)
want_body 'LEGACY-WP-HOME' /; want_body 'TIENDA-STUB' /tienda/
deploy; ok $DEPLOY_RC "deploy exit 0"
tree_matches_dist
smoke_site
shop_intact "$TH"
[ "$(dx cat $DOC/.well-known/acme-challenge/TESTTOKEN123)" = "$WK" ]; ok $? ".well-known/acme-challenge file intact"
want_body 'ACME-TOKEN-STUB' /.well-known/acme-challenge/TESTTOKEN123
echo "   -- leftovers of the legacy root (documented, not fixed without the cutover):"
want_code 200 /wp-login.php;                         # LEFTOVER: legacy login still reachable
want_body 'LEGACY-WP-STUB wp-login' /wp-login.php
want_body 'LEGACY-WP-HOME' /index.php
want_body 'LEGACY-ELEMENTOR-PLUGIN' /wp-content/plugins/elementor/elementor.php
want_body 'EVIL-IN-UPLOADS' /wp-content/uploads/2025/05/evil.php
want_code 200 /error_log
want_body 'LEGACY-BENEFICIOS-OLD-SNAPSHOT' /beneficios/index.php
want_body 'BOT-MAIL-INDEX-STUB' /beneficios/index.php -A "Mozilla/5.0 (compatible; Googlebot/2.1)"     # cloaking still live
not_body 'BOT-MAIL-INDEX-STUB|LEGACY-BENEFICIOS' /beneficios/ -A "Googlebot"                           # /beneficios/ itself: dist index.html wins (DirectoryIndex)
want_code 200 /xmlrpc.php
dx sh -c "test -f $DOC/beneficios/google5d33d1e254c564e8.html"; ok $? "[info] google*.html of legacy beneficios/ still there (no cutover)"
want_code 200 /wp-content/uploads/2025/05/logo-old.png

# ------------------------------------------------------------------ (c) stale account WITH the documented cutover
SC="c-stale-with-cutover"
echo "== $SC"; seed stale
TH=$(tienda_hash)
dx sh -c "cd $DOC && ls -A | sort > /tmp/before.top"
block cutover; ok $BLOCK_RC "DEPLOY.md cutover block exit 0"
RB=$(dx sh -c 'for d in /home/arbicopc/respaldos/wp-root-*; do echo $d; done | tail -1')
echo "   top-level after cutover: $(top)"
echo "$(top)" | grep -q 'tienda' && echo "$(top)" | grep -q '\.well-known' && echo "$(top)" | grep -q 'cgi-bin' && echo "$(top)" | grep -q 'wp-content'; ok $? "kept: tienda, .well-known, cgi-bin, wp-content (uploads only)"
dx sh -c "cd $DOC && for x in wp-admin wp-includes wp-login.php index.php wp-config.php xmlrpc.php readme.html license.txt .htaccess error_log backup-old.zip beneficios; do [ -e \$x ] && echo \$x; done"
[ -z "$(dx sh -c "cd $DOC && for x in wp-admin wp-includes wp-login.php index.php wp-config.php xmlrpc.php readme.html license.txt .htaccess error_log backup-old.zip beneficios; do [ -e \$x ] && echo \$x; done")" ]; ok $? "no legacy WordPress root file/folder is left in the docroot"
[ "$(dx sh -c "ls -A $DOC/wp-content")" = "uploads" ]; ok $? "wp-content/ keeps ONLY uploads/"
dx sh -c "cd $RB && test -f wp-config.php && test -d wp-admin && test -f .htaccess && test -f error_log && test -f beneficios/index.php && test -d wp-content/plugins && test -f wp-content/debug.log"; ok $? "everything moved is in $RB (nothing deleted)"
[ "$(dx stat -c %a "$RB")" = 700 ]; ok $? "backup folder mode 700 (wp-config.php with old credentials is not world-readable)"
dx sh -c "test -f $DOC/wp-content/uploads/.htaccess"; ok $? "uploads/.htaccess (PHP denied) created"
[ "$(tienda_hash)" = "$TH" ]; ok $? "tienda/ untouched by the cutover"
deploy; ok $DEPLOY_RC "deploy exit 0"
tree_matches_dist
block postdeploy; ok $BLOCK_RC "DEPLOY.md postdeploy block exit 0"
dx grep -q 'cPanel-generated handler' $DOC/.htaccess; ok $? "cPanel PHP handler block restored into the new .htaccess"
dx sh -c "cmp $DOC/beneficios/google5d33d1e254c564e8.html $RB/beneficios/google5d33d1e254c564e8.html && cmp $DOC/beneficios/google83cb3787dadbd8a3.html $RB/beneficios/google83cb3787dadbd8a3.html"; ok $? "Search Console google*.html restored into the new /beneficios/"
want_code 200 /beneficios/google5d33d1e254c564e8.html
# simulate "create api/config.secret.php via File Manager" (sim values, never real)
du_ sh -c "cp $DOC/api/config.secret.example.php $DOC/api/config.secret.php && sed -i 's/PASTE-MAILBOX-PASSWORD-HERE/sim-not-a-secret/' $DOC/api/config.secret.php && chmod 640 $DOC/api/config.secret.php"; ok $? "(sim) config.secret.php created from the example, mode 640"
smoke_site
shop_intact "$TH"
[ "$(dx cat $DOC/.well-known/acme-challenge/TESTTOKEN123)" = "$WK" ]; ok $? ".well-known/acme-challenge file intact"
want_body 'ACME-TOKEN-STUB' /.well-known/acme-challenge/TESTTOKEN123
echo "   -- former leftovers must be gone:"
for x in /wp-login.php /wp-admin/ /xmlrpc.php /wp-content/plugins/elementor/elementor.php /error_log /beneficios/index.php /index.php /wp-config.php /readme.html /license.txt; do want_code 404 "$x"; done
want_code 403 /wp-content/uploads/2025/05/evil.php
want_code 200 /wp-content/uploads/2025/05/logo-old.png
not_body 'BOT-MAIL-INDEX-STUB' /beneficios/ -A "Googlebot"
EXPECT=$(dx sh -c "{ ls -A $REPO/dist; echo tienda; echo .well-known; echo cgi-bin; echo wp-content; } | sort | tr '\n' ' '")
[ "$(top)" = "$EXPECT" ]; ok $? "docroot top level == dist/ + {tienda,.well-known,cgi-bin,wp-content}" "$(top)"

# ------------------------------------------------------------------ (d) redeploy with runtime state
SC="d-redeploy-keeps-runtime-state"
echo "== $SC (continues from c)"
claim; N1=$CLAIM_NO; U1=$CLAIM_URL
[ -n "$N1" ]; ok $? "runtime claim created before redeploy -> $N1"
SH0=$(state_hash); CS0=$(dx sha256sum $DOC/api/config.secret.php | cut -c1-64); CNT0=$(dx cat $DOC/api/storage/counter.dat 2>/dev/null)
du_ sh -c "cd /tmp/work && echo '# redeploy marker' >> dist/robots.txt && git add -A && git -c user.name=sim -c user.email=sim@e.invalid commit -q -m 'edit robots' && cd $REPO && git pull -q" ; ok $? "(sim) new commit pushed + cPanel 'Update from Remote' (git pull)"
deploy; ok $DEPLOY_RC "redeploy exit 0"
want_body '# redeploy marker' /robots.txt
[ "$(state_hash)" = "$SH0" ]; ok $? "api/storage runtime data + config.secret.php byte-identical after redeploy (hash ${SH0:0:12})"
[ "$(dx sha256sum $DOC/api/config.secret.php | cut -c1-64)" = "$CS0" ]; ok $? "config.secret.php unchanged"
[ "$(dx stat -c %a $DOC/api/config.secret.php)" = 640 ]; ok $? "config.secret.php mode still 640"
[ "$(dx cat $DOC/api/storage/counter.dat 2>/dev/null)" = "$CNT0" ]; ok $? "counter.dat unchanged ($CNT0)"
dx sh -c "ls $DOC/api/storage/hojas/*/$N1.pdf >/dev/null"; ok $? "archived sheet $N1 still present"
dx sh -c "cd $DOC/api/storage && for f in .gitignore .htaccess hojas/.gitignore log/.gitignore; do cmp \$f $REPO/dist/api/storage/\$f || exit 1; done"; ok $? "placeholder files overwritten with identical content (cp -R on top is harmless)"
[ "$(code "$(U "$U1")")" = 200 ]; ok $? "PDF of $N1 still downloadable with its original key after redeploy"
claim; N2=$CLAIM_NO
[ -n "$N2" ] && [ "$N2" != "$N1" ] && [ "${N2##*-}" -gt "${N1##*-}" ]; ok $? "numbering continues after redeploy: $N1 -> $N2"
[ "$(dx stat -c %a $DOC/api/storage)" = 755 ] || true
dx sh -c "ls -ld $DOC/api/storage | cut -d' ' -f1,3"
want_code 403 /api/storage/counter.dat
shop_intact "$TH"
# stale-vs-pdf: a second deploy run changes nothing else
deploy; ok $DEPLOY_RC "second consecutive redeploy exit 0 (idempotent)"
[ "$(state_hash)" != "$SH0" ] && rec PASS "state differs from before only by the claim made in this scenario ($N2)" || rec FAIL "state should include claim $N2"

# ------------------------------------------------------------------ (e) rollback literal
SC="e-rollback"
echo "== $SC (continues from d)"
NPDF=$(dx sh -c "ls $DOC/api/storage/hojas/*/*.pdf | wc -l"); SH1=$(state_hash); CS1=$(dx sha256sum $DOC/api/config.secret.php | cut -c1-64)
block rollback; ok $BLOCK_RC "DEPLOY.md rollback block exit 0"
want_body 'LEGACY-WP-HOME uri=/' /
want_body 'LEGACY-WP-HOME uri=/nosotros/' /nosotros/          # old WP rewrite is back
want_body 'LEGACY-WP-STUB wp-login' /wp-login.php
want_body 'LEGACY-WP-ADMIN' /wp-admin/
want_body 'LEGACY-BENEFICIOS-OLD-SNAPSHOT' /beneficios/
want_code 200 /wp-content/uploads/2025/05/logo-old.png
want_body 'TIENDA-STUB uri=/tienda/' /tienda/
want_body 'ACME-TOKEN-STUB' /.well-known/acme-challenge/TESTTOKEN123
want_body 'LEGACY-WP-HOME uri=/robots.txt' /robots.txt          # legacy catch-all rewrite is back
[ "$(state_hash)" = "$SH1" ]; ok $? "api/storage + config.secret.php untouched by rollback (hash ${SH1:0:12})"
[ "$(dx sha256sum $DOC/api/config.secret.php | cut -c1-64)" = "$CS1" ]; ok $? "config.secret.php identical"
[ "$(dx sh -c "ls $DOC/api/storage/hojas/*/*.pdf | wc -l")" = "$NPDF" ]; ok $? "all $NPDF archived sheets still on disk"
dx sh -c "cd $DOC && sha256sum -c --quiet /home/arbicopc/.sim/legacy.sha" > /tmp/legacy.chk 2>&1; ok $? "every file of the original legacy docroot is back, byte-identical (sha256sum -c)" "$(head -3 /tmp/legacy.chk | tr '\n' '|')"
[ "$(tienda_hash)" = "$TH" ]; ok $? "tienda/ untouched by rollback"
dx sh -c "ls -d /home/arbicopc/respaldos/static-*/index.html /home/arbicopc/respaldos/api-state-*/config.secret.php >/dev/null"; ok $? "static site and api state saved under respaldos/ (nothing deleted)"
echo "   top-level after rollback: $(top)"
LEG=$(dx sh -c "{ cat /home/arbicopc/.sim/legacy.top; echo api; } | sort | tr '\n' ' '")
[ "$(top)" = "$LEG" ]; ok $? "docroot top level == original legacy top level + api/ (storage + secret only)" "$(top)"
dx sh -c "ls -A $DOC/api | sort | tr '\n' ' '"
# ---- (f) re-apply after rollback
SC="f-reapply-after-rollback"
echo "== $SC (cutover + deploy again over preserved state)"
block cutover; ok $BLOCK_RC "cutover block again exit 0"
deploy; ok $DEPLOY_RC "deploy exit 0"
block postdeploy; ok $BLOCK_RC "postdeploy again exit 0"
want_code 200 /; sameas / dist/index.html
[ "$(state_hash)" = "$SH1" ]; ok $? "state still identical after re-applying"
claim; N3=$CLAIM_NO
[ -n "$N3" ] && [ "${N3##*-}" -gt "${N2##*-}" ]; ok $? "numbering continues: $N2 -> $N3"
shop_intact "$TH"
want_code 404 /wp-login.php

# ---- (g) shop-fix branch of DEPLOY.md
SC="g-shop-fix-branch"
echo "== $SC"
block shopfix; ok $BLOCK_RC "shopfix block exit 0"
dx sh -c "test ! -e $DOC/tienda/wp-content/mu-plugins/arbicop-shop-cart.php && ls -d /home/arbicopc/respaldos/mu-plugins-apartados-*/arbicop-shop-cart.php >/dev/null"; ok $? "3 custom files moved (not deleted) out of mu-plugins/"
[ "$(tienda_hash)" = "$TH" ]; ok $? "rest of tienda/ unchanged"

# ================================================================================================================
P=$(awk -F'\t' '$3=="PASS"' "$TSV" | wc -l); F=$(awk -F'\t' '$3=="FAIL"' "$TSV" | wc -l)
{
  echo "# Deploy simulation results (cPanel Git deploy, cutover, rollback)"
  echo
  echo "Run: $(date -u +%Y-%m-%dT%H:%M:%SZ)  -  **$P PASS / $F FAIL**"
  echo
  echo "Setup: Apache 2.4 + mod_php 8.1 (docker/deploy-test/Dockerfile) running as user \`arbicopc\`; docroot \`$DOC\`; repo created with \`git init\` + commit of the .gitignore allow-list and \`git clone\` to \`$REPO\`; \`.cpanel.yml\` and the DEPLOY.md blocks (cutover, postdeploy, rollback, shopfix) are extracted and executed UNMODIFIED by \`docker/deploy-test/cpanel-run.sh\` / \`run-block.sh\`. Ports: stale 8090, clean 8092 (8091 is used by another project). Mail is dry-run."
  echo
  echo "NOT verified here: the real cPanel run of .cpanel.yml, LiteSpeed, real SMTP, izipay, SSH clone from GitHub, the real WordPress/WooCommerce (the legacy root and /tienda are stubs with the real .htaccess files), real cPanel PHP handler (ea-php82), real HTTPS."
  echo
  awk -F'\t' '{ if ($1!=cur) { cur=$1; printf "\n## %s\n\n| Result | Check | Detail |\n|---|---|---|\n", cur } d=$4; gsub(/\|/,"/",d); n=$2; gsub(/\|/,"/",n); printf "| %s | %s | %s |\n", $3, n, d }' "$TSV"
  [ -f docker/deploy-test/results-notes.md ] && { echo; cat docker/deploy-test/results-notes.md; }
} > "$OUT"
echo; echo "TOTAL: $P PASS / $F FAIL  -> $OUT"
rm -f "$TSV" ./docker/deploy-test/.hoja.tmp
