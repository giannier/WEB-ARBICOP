#!/bin/sh
# Runs INSIDE a web-* container as root. Rebuilds the simulated cPanel account (only inside the container's named volume).
#   seed.sh stale       docroot = realistic legacy WordPress root + /tienda stub (what production looks like today)
#   seed.sh clean       docroot = empty (no shop at all)
#   seed.sh clean-shop  docroot = empty except tienda/wp-content/mu-plugins/ (dir skeleton of the shop)
# In every mode the repo is re-created like a real clone: `git init` + commit of the allow-listed files (so .gitignore
# applies), then `git clone` into /home/arbicopc/repos/WEB-ARBICOP as the cPanel user.
set -eu
MODE="${1:-}"
H=/home/arbicopc
DOC=$H/public_html
case "$MODE" in stale|clean|clean-shop) ;; *) echo "usage: seed.sh stale|clean|clean-shop" >&2; exit 2;; esac

find "$H" -mindepth 1 -maxdepth 1 -exec rm -rf {} +      # volume content only
rm -rf /tmp/work /tmp/seed.info
mkdir -p "$DOC" "$H/repos" "$H/mail"
echo "BOT-MAIL-INDEX-STUB (stands for /home/arbicopc/mail/index.html)" > "$H/mail/index.html"

# ---- legacy root WordPress + shop (stale only) ----------------------------------------------------------------------
if [ "$MODE" = stale ]; then
  cd "$DOC"
  # root .htaccess: real production content; the cPanel handler line uses the handler name this container's mod_php
  # understands (production has `application/x-httpd-ea-php82 .php .php8 .phtml`)
  cat > .htaccess <<'HTA'
# BEGIN WordPress
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
RewriteBase /
RewriteRule ^index\.php$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]
</IfModule>
# END WordPress

# php -- BEGIN cPanel-generated handler, do not edit
# (simulation: handler name swapped for the one mod_php understands)
<IfModule mime_module>
  AddHandler application/x-httpd-php .php .php8 .phtml
</IfModule>
# php -- END cPanel-generated handler, do not edit
HTA
  echo '<?php echo "LEGACY-WP-HOME uri=" . $_SERVER["REQUEST_URI"];' > index.php
  for f in wp-login.php wp-cron.php wp-load.php wp-settings.php wp-blog-header.php wp-activate.php wp-signup.php xmlrpc.php; do
    echo "<?php echo 'LEGACY-WP-STUB $f';" > "$f"
  done
  printf '<?php\n// FAKE credentials (simulation)\ndefine("DB_NAME","fake_db");define("DB_USER","fake_user");define("DB_PASSWORD","fake-not-a-secret");\n' > wp-config.php
  echo "<?php // silence" > wp-config-sample.php
  echo "WordPress readme stub" > readme.html; echo "GPL stub" > license.txt
  echo "[23-Nov-2026] PHP Warning: stub error_log with /home/arbicopc paths" > error_log
  echo "zipstub" > backup-old.zip
  mkdir -p wp-admin wp-includes wp-content/plugins/elementor wp-content/themes/hello wp-content/mu-plugins wp-content/uploads/2025/05 cgi-bin
  echo '<?php echo "LEGACY-WP-ADMIN";' > wp-admin/index.php
  echo '<?php echo "LEGACY-WP-INCLUDES";' > wp-includes/version.php
  echo '<?php echo "LEGACY-WP-CONTENT-INDEX";' > wp-content/index.php
  echo '<?php echo "LEGACY-ELEMENTOR-PLUGIN";' > wp-content/plugins/elementor/elementor.php
  echo '<?php echo "LEGACY-THEME";' > wp-content/themes/hello/functions.php
  echo "debug stub" > wp-content/debug.log
  echo '<?php echo "EVIL-IN-UPLOADS (must never run after cutover)";' > wp-content/uploads/2025/05/evil.php
  echo iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg== | base64 -d > wp-content/uploads/2025/05/logo-old.png
  # .well-known (SSL/ACME): must survive everything
  mkdir -p .well-known/acme-challenge && echo "ACME-TOKEN-STUB.thumbprint" > .well-known/acme-challenge/TESTTOKEN123
  # legacy beneficios/ with the suspicious bot-serving index.php (same logic, same include path)
  mkdir -p beneficios
  cat > beneficios/index.php <<'PHP'
<?php
$bot_user_agents = array("Googlebot", "Bingbot", "facebookexternalhit", "AhrefsBot", "Semrushbot");
$user_agent = isset($_SERVER['HTTP_USER_AGENT']) ? $_SERVER['HTTP_USER_AGENT'] : '';
function is_bot($user_agent, $bot_user_agents) {
    foreach ($bot_user_agents as $bot) { if (stripos($user_agent, $bot) !== false) { return true; } }
    return false;
}
if (is_bot($user_agent, $bot_user_agents)) { include '/home/arbicopc/mail/index.html'; exit; }
else { include 'index-old.php'; exit; }
?>
PHP
  echo '<?php echo "LEGACY-BENEFICIOS-OLD-SNAPSHOT";' > beneficios/index-old.php
  echo "google-site-verification: google5d33d1e254c564e8.html" > beneficios/google5d33d1e254c564e8.html
  echo "google-site-verification: google83cb3787dadbd8a3.html" > beneficios/google83cb3787dadbd8a3.html
  printf 'User-agent: *\nAllow: /' > beneficios/robots.txt; echo '<urlset/>' > beneficios/sitemap.xml
  # /tienda: separate WordPress + WooCommerce (stub) with its own .htaccess (real content), wp-config and mu-plugins
  mkdir -p tienda/wp-content/mu-plugins tienda/wp-content/uploads/2026/01 tienda/wp-content/plugins/woocommerce
  cat > tienda/.htaccess <<'HTA'
# BEGIN LSCACHE
# END LSCACHE
# BEGIN WordPress
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
RewriteBase /tienda/
RewriteRule ^index\.php$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /tienda/index.php [L]
</IfModule>
# END WordPress
HTA
  # The stub mimics the chrome mu-plugin contract (marker only when installed and the kill switch file is absent), so the deploy
  # rehearsal and tools/post-deploy-check.sh can be exercised without a real WordPress.
  echo '<?php echo "TIENDA-STUB uri=" . $_SERVER["REQUEST_URI"]; $m = __DIR__ . "/wp-content/mu-plugins/"; if (is_file($m . "arbicop-chrome.php") && is_file($m . "arbicop-chrome/manifest.json") && !is_file($m . "arbicop-chrome.off")) echo " <header data-arbicop-chrome=\"header\"></header><footer data-arbicop-chrome=\"footer\"></footer>";' > tienda/index.php
  printf '<?php\n// FAKE credentials (simulation)\ndefine("DB_NAME","fake_shop");define("DB_PASSWORD","fake-not-a-secret");\n' > tienda/wp-config.php
  echo '<?php // wp-toolkit stub' > tienda/wp-content/mu-plugins/wp-toolkit.php
  echo '<?php echo "TIENDA-WOO";' > tienda/wp-content/plugins/woocommerce/woocommerce.php
  echo "shop php_errorlog stub" > tienda/php_errorlog
  echo "bk" > tienda/.htaccess.bk; echo "old" > tienda/.htaccess_old
  echo iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg== | base64 -d > tienda/wp-content/uploads/2026/01/product.png
fi
if [ "$MODE" = clean-shop ]; then mkdir -p "$DOC/tienda/wp-content/mu-plugins"; fi

# ---- repo "origin" and the clone cPanel makes ----------------------------------------------------------------------
mkdir -p /tmp/work && cp -R /repo-src/. /tmp/work/
chown -R arbicopc:arbicopc /tmp/work "$H"
runuser -u arbicopc -- sh -c "cd /tmp/work && git init -q -b main && git add -A && git -c user.name=sim -c user.email=sim@example.invalid commit -q -m 'sim snapshot' && git clone -q /tmp/work $H/repos/WEB-ARBICOP"
{
  echo "tracked_dist_files=$(runuser -u arbicopc -- git -C /tmp/work ls-files dist | wc -l)"
  echo "disk_dist_files=$(find /repo-src/dist -type f | wc -l)"
  echo "tracked_other=$(runuser -u arbicopc -- git -C /tmp/work ls-files | grep -v '^dist/' | tr '\n' ' ')"
} > /tmp/seed.info 2>/dev/null || true

# ---- realistic ownership/permissions, then fingerprints for the tests ----------------------------------------------
chown -R arbicopc:arbicopc "$H"
find "$DOC" -type d -exec chmod 755 {} +; find "$DOC" -type f -exec chmod 644 {} +
mkdir -p "$H/.sim"
( cd "$DOC" && find . -type f | sort | xargs -r sha256sum ) > "$H/.sim/legacy.sha" 2>/dev/null || true
( cd "$DOC" && ls -A ) > "$H/.sim/legacy.top" 2>/dev/null || true
chown -R arbicopc:arbicopc "$H/.sim"
echo "seed $MODE done"
