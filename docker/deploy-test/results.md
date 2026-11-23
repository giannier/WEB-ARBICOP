# Deploy simulation results (cPanel Git deploy, cutover, rollback)

Run: 2026-11-23T21:03:01Z  -  **285 PASS / 0 FAIL**

Setup: Apache 2.4 + mod_php 8.1 (docker/deploy-test/Dockerfile) running as user `arbicopc`; docroot `/home/arbicopc/public_html`; repo created with `git init` + commit of the .gitignore allow-list and `git clone` to `/home/arbicopc/repos/WEB-ARBICOP`; `.cpanel.yml` and the DEPLOY.md blocks (cutover, postdeploy, rollback, shopfix) are extracted and executed UNMODIFIED by `docker/deploy-test/cpanel-run.sh` / `run-block.sh`. Ports: stale 8090, clean 8092 (8091 is used by another project). Mail is dry-run.

NOT verified here: the real cPanel run of .cpanel.yml, LiteSpeed, real SMTP, izipay, SSH clone from GitHub, the real WordPress/WooCommerce (the legacy root and /tienda are stubs with the real .htaccess files), real cPanel PHP handler (ea-php82), real HTTPS.


## a-clean-empty-docroot

| Result | Check | Detail |
|---|---|---|
| PASS | git clone carries the whole dist/ (471 tracked == 471 on disk): .gitignore drops nothing from dist/ |  |
| PASS | .cpanel.yml parses + paths exist (tools/check-cpanel-yml.py) |  |
| PASS | no shop on the account: task 1 (site) copied, task 2 fails visibly (no mkdir by design), exit 1 |  |
| PASS | task 1 (dist/. -> docroot) succeeded |  |
| PASS | every file of dist/ is present in the docroot, byte-identical |  |
| PASS | GET /  -> 200 |  |
| PASS | GET / identical to dist/index.html |  |
| PASS | GET /  body !~ LEGACY-WP/TIENDA-STUB |  |
| PASS | GET /arbitraje/ identical to dist/arbitraje/index.html |  |
| PASS | GET /beneficios/ identical to dist/beneficios/index.html |  |
| PASS | GET /conciliacion/ identical to dist/conciliacion/index.html |  |
| PASS | GET /contacto/ identical to dist/contacto/index.html |  |
| PASS | GET /corretaje/ identical to dist/corretaje/index.html |  |
| PASS | GET /libro-de-reclamaciones/ identical to dist/libro-de-reclamaciones/index.html |  |
| PASS | GET /nosotros/ identical to dist/nosotros/index.html |  |
| PASS | GET /peritaje/ identical to dist/peritaje/index.html |  |
| PASS | GET /tasacion/ identical to dist/tasacion/index.html |  |
| PASS | all 76 /assets/ URLs referenced by / return 200 |  |
| PASS | GET /assets/data/ubigeo.json  -> 200 |  |
| PASS | GET /assets/js/libro.js  -> 200 |  |
| PASS | GET /robots.txt  -> 200 |  |
| PASS | GET /sitemap.xml  -> 200 |  |
| PASS | GET /favicon.ico  -> 200 |  |
| PASS | GET /no-existe/  -> 404 |  |
| PASS | GET /no-existe/  body ~ Página no encontrada – ARBI |  |
| PASS | GET /libro-de-reclamaciones-2/  Location: (http://localhost:8092)?/libro-de-reclamaciones/ |  |
| PASS | GET /libro-de-reclamaciones-2/  -> 301 |  |
| PASS | GET /index.html  -> 301 |  |
| PASS | GET /index.html  Location: (http://localhost:8092)?/ |  |
| PASS | GET /nosotros/index.html  -> 301 |  |
| PASS | GET /  -> 200 |  |
| PASS | GET / -H Host: 127.0.0.1:8092 -> 200 |  |
| PASS | GET / -H Host: arbicop.com -> 301 |  |
| PASS | GET / -H Host: arbicop.com Location: https://arbicop.com/ |  |
| PASS | GET / -H Host: arbicop.com -H X-Forwarded-Proto: https -> 200 |  |
| PASS | GET /api/config.php  -> 403 |  |
| PASS | GET /api/config.secret.php  -> 403 |  |
| PASS | GET /api/config.secret.example.php  -> 403 |  |
| PASS | GET /api/storage/  -> 403 |  |
| PASS | GET /api/storage/counter.dat  -> 403 |  |
| PASS | GET /api/src/Security.php  -> 403 |  |
| PASS | GET /api/lib/  -> 403 |  |
| PASS | GET /api/tools/  -> 403 |  |
| PASS | GET /api/fonts/  -> 403 |  |
| PASS | GET /api/assets/logo.png  -> 403 |  |
| PASS | GET /api/README.md  -> 403 |  |
| PASS | GET /.htaccess  -> 403 |  |
| PASS | GET /libro-de-reclamaciones/  -> 200 |  |
| PASS | GET /api/token.php  body ~ ^\{.*"token":"[0-9a-f]{64}" |  |
| PASS | dry-run claim accepted -> LR-2026-0001 |  |
| PASS | PDF download for LR-2026-0001 is a PDF |  |
| PASS | LR-2026-0001 archived (pdf) + dry-run .eml written under api/storage |  |
| PASS | tools/post-deploy-check.sh exit 0 |  |
| PASS | GET /tienda/  -> 404 |  |

## a2-clean-with-shop-skeleton

| Result | Check | Detail |
|---|---|---|
| PASS | all 4 tasks succeed when tienda/wp-content/mu-plugins/ exists (rc=0) |  |
| PASS | mu-plugins/arbicop-chrome.php installed |  |
| PASS | mu-plugins/arbicop-shop-cart.php installed |  |
| PASS | mu-plugins/arbicop-chrome/ installed (cp -R), identical to repo |  |
| PASS | every file of dist/ is present in the docroot, byte-identical |  |
| PASS | no config.secret.php was created by the deploy |  |

## b-stale-no-cutover

| Result | Check | Detail |
|---|---|---|
| PASS | GET /  body ~ LEGACY-WP-HOME |  |
| PASS | GET /tienda/  body ~ TIENDA-STUB |  |
| PASS | deploy exit 0 |  |
| PASS | every file of dist/ is present in the docroot, byte-identical |  |
| PASS | GET /  -> 200 |  |
| PASS | GET / identical to dist/index.html |  |
| PASS | GET /  body !~ LEGACY-WP/TIENDA-STUB |  |
| PASS | GET /arbitraje/ identical to dist/arbitraje/index.html |  |
| PASS | GET /beneficios/ identical to dist/beneficios/index.html |  |
| PASS | GET /conciliacion/ identical to dist/conciliacion/index.html |  |
| PASS | GET /contacto/ identical to dist/contacto/index.html |  |
| PASS | GET /corretaje/ identical to dist/corretaje/index.html |  |
| PASS | GET /libro-de-reclamaciones/ identical to dist/libro-de-reclamaciones/index.html |  |
| PASS | GET /nosotros/ identical to dist/nosotros/index.html |  |
| PASS | GET /peritaje/ identical to dist/peritaje/index.html |  |
| PASS | GET /tasacion/ identical to dist/tasacion/index.html |  |
| PASS | all 76 /assets/ URLs referenced by / return 200 |  |
| PASS | GET /assets/data/ubigeo.json  -> 200 |  |
| PASS | GET /assets/js/libro.js  -> 200 |  |
| PASS | GET /robots.txt  -> 200 |  |
| PASS | GET /sitemap.xml  -> 200 |  |
| PASS | GET /favicon.ico  -> 200 |  |
| PASS | GET /no-existe/  -> 404 |  |
| PASS | GET /no-existe/  body ~ Página no encontrada – ARBI |  |
| PASS | GET /libro-de-reclamaciones-2/  Location: (http://localhost:8090)?/libro-de-reclamaciones/ |  |
| PASS | GET /libro-de-reclamaciones-2/  -> 301 |  |
| PASS | GET /index.html  -> 301 |  |
| PASS | GET /index.html  Location: (http://localhost:8090)?/ |  |
| PASS | GET /nosotros/index.html  -> 301 |  |
| PASS | GET /  -> 200 |  |
| PASS | GET / -H Host: 127.0.0.1:8090 -> 200 |  |
| PASS | GET / -H Host: arbicop.com -> 301 |  |
| PASS | GET / -H Host: arbicop.com Location: https://arbicop.com/ |  |
| PASS | GET / -H Host: arbicop.com -H X-Forwarded-Proto: https -> 200 |  |
| PASS | GET /api/config.php  -> 403 |  |
| PASS | GET /api/config.secret.php  -> 403 |  |
| PASS | GET /api/config.secret.example.php  -> 403 |  |
| PASS | GET /api/storage/  -> 403 |  |
| PASS | GET /api/storage/counter.dat  -> 403 |  |
| PASS | GET /api/src/Security.php  -> 403 |  |
| PASS | GET /api/lib/  -> 403 |  |
| PASS | GET /api/tools/  -> 403 |  |
| PASS | GET /api/fonts/  -> 403 |  |
| PASS | GET /api/assets/logo.png  -> 403 |  |
| PASS | GET /api/README.md  -> 403 |  |
| PASS | GET /.htaccess  -> 403 |  |
| PASS | GET /libro-de-reclamaciones/  -> 200 |  |
| PASS | GET /api/token.php  body ~ ^\{.*"token":"[0-9a-f]{64}" |  |
| PASS | dry-run claim accepted -> LR-2026-0001 |  |
| PASS | PDF download for LR-2026-0001 is a PDF |  |
| PASS | LR-2026-0001 archived (pdf) + dry-run .eml written under api/storage |  |
| PASS | tools/post-deploy-check.sh exit 0 |  |
| PASS | tienda/ untouched byte-for-byte (all files except the shop chrome + cart mu-plugins) sha=49f623ec386a |  |
| PASS | tienda/wp-content/mu-plugins/arbicop-chrome.php installed, identical to repo |  |
| PASS | tienda/wp-content/mu-plugins/arbicop-shop-cart.php installed, identical to repo |  |
| PASS | tienda/wp-content/mu-plugins/arbicop-chrome/ installed, identical to repo (header, footer, css, manifest) |  |
| PASS | GET /tienda/  body ~ TIENDA-STUB uri=/tienda/ |  |
| PASS | GET /tienda/producto-x/  body ~ TIENDA-STUB uri=/tienda/producto-x/ |  |
| PASS | GET /tienda/wp-content/uploads/2026/01/product.png  -> 200 |  |
| PASS | .well-known/acme-challenge file intact |  |
| PASS | GET /.well-known/acme-challenge/TESTTOKEN123  body ~ ACME-TOKEN-STUB |  |
| PASS | GET /wp-login.php  -> 200 |  |
| PASS | GET /wp-login.php  body ~ LEGACY-WP-STUB wp-login |  |
| PASS | GET /index.php  body ~ LEGACY-WP-HOME |  |
| PASS | GET /wp-content/plugins/elementor/elementor.php  body ~ LEGACY-ELEMENTOR-PLUGIN |  |
| PASS | GET /wp-content/uploads/2025/05/evil.php  body ~ EVIL-IN-UPLOADS |  |
| PASS | GET /error_log  -> 200 |  |
| PASS | GET /beneficios/index.php  body ~ LEGACY-BENEFICIOS-OLD-SNAPSHOT |  |
| PASS | GET /beneficios/index.php -A Mozilla/5.0 (compatible; Googlebot/2.1) body ~ BOT-MAIL-INDEX-STUB |  |
| PASS | GET /beneficios/ -A Googlebot body !~ BOT-MAIL-INDEX-STUB/LEGACY-BENEFICIOS |  |
| PASS | GET /xmlrpc.php  -> 200 |  |
| PASS | [info] google*.html of legacy beneficios/ still there (no cutover) |  |
| PASS | GET /wp-content/uploads/2025/05/logo-old.png  -> 200 |  |

## c-stale-with-cutover

| Result | Check | Detail |
|---|---|---|
| PASS | DEPLOY.md cutover block exit 0 |  |
| PASS | kept: tienda, .well-known, cgi-bin, wp-content (uploads only) |  |
| PASS | no legacy WordPress root file/folder is left in the docroot |  |
| PASS | wp-content/ keeps ONLY uploads/ |  |
| PASS | everything moved is in /home/arbicopc/respaldos/wp-root-20261123-210131 (nothing deleted) |  |
| PASS | backup folder mode 700 (wp-config.php with old credentials is not world-readable) |  |
| PASS | uploads/.htaccess (PHP denied) created |  |
| PASS | tienda/ untouched by the cutover |  |
| PASS | deploy exit 0 |  |
| PASS | every file of dist/ is present in the docroot, byte-identical |  |
| PASS | DEPLOY.md postdeploy block exit 0 |  |
| PASS | cPanel PHP handler block restored into the new .htaccess |  |
| PASS | Search Console google*.html restored into the new /beneficios/ |  |
| PASS | GET /beneficios/google5d33d1e254c564e8.html  -> 200 |  |
| PASS | (sim) config.secret.php created from the example, mode 640 |  |
| PASS | GET /  -> 200 |  |
| PASS | GET / identical to dist/index.html |  |
| PASS | GET /  body !~ LEGACY-WP/TIENDA-STUB |  |
| PASS | GET /arbitraje/ identical to dist/arbitraje/index.html |  |
| PASS | GET /beneficios/ identical to dist/beneficios/index.html |  |
| PASS | GET /conciliacion/ identical to dist/conciliacion/index.html |  |
| PASS | GET /contacto/ identical to dist/contacto/index.html |  |
| PASS | GET /corretaje/ identical to dist/corretaje/index.html |  |
| PASS | GET /libro-de-reclamaciones/ identical to dist/libro-de-reclamaciones/index.html |  |
| PASS | GET /nosotros/ identical to dist/nosotros/index.html |  |
| PASS | GET /peritaje/ identical to dist/peritaje/index.html |  |
| PASS | GET /tasacion/ identical to dist/tasacion/index.html |  |
| PASS | all 76 /assets/ URLs referenced by / return 200 |  |
| PASS | GET /assets/data/ubigeo.json  -> 200 |  |
| PASS | GET /assets/js/libro.js  -> 200 |  |
| PASS | GET /robots.txt  -> 200 |  |
| PASS | GET /sitemap.xml  -> 200 |  |
| PASS | GET /favicon.ico  -> 200 |  |
| PASS | GET /no-existe/  -> 404 |  |
| PASS | GET /no-existe/  body ~ Página no encontrada – ARBI |  |
| PASS | GET /libro-de-reclamaciones-2/  Location: (http://localhost:8090)?/libro-de-reclamaciones/ |  |
| PASS | GET /libro-de-reclamaciones-2/  -> 301 |  |
| PASS | GET /index.html  -> 301 |  |
| PASS | GET /index.html  Location: (http://localhost:8090)?/ |  |
| PASS | GET /nosotros/index.html  -> 301 |  |
| PASS | GET /  -> 200 |  |
| PASS | GET / -H Host: 127.0.0.1:8090 -> 200 |  |
| PASS | GET / -H Host: arbicop.com -> 301 |  |
| PASS | GET / -H Host: arbicop.com Location: https://arbicop.com/ |  |
| PASS | GET / -H Host: arbicop.com -H X-Forwarded-Proto: https -> 200 |  |
| PASS | GET /api/config.php  -> 403 |  |
| PASS | GET /api/config.secret.php  -> 403 |  |
| PASS | GET /api/config.secret.example.php  -> 403 |  |
| PASS | GET /api/storage/  -> 403 |  |
| PASS | GET /api/storage/counter.dat  -> 403 |  |
| PASS | GET /api/src/Security.php  -> 403 |  |
| PASS | GET /api/lib/  -> 403 |  |
| PASS | GET /api/tools/  -> 403 |  |
| PASS | GET /api/fonts/  -> 403 |  |
| PASS | GET /api/assets/logo.png  -> 403 |  |
| PASS | GET /api/README.md  -> 403 |  |
| PASS | GET /.htaccess  -> 403 |  |
| PASS | GET /libro-de-reclamaciones/  -> 200 |  |
| PASS | GET /api/token.php  body ~ ^\{.*"token":"[0-9a-f]{64}" |  |
| PASS | dry-run claim accepted -> LR-2026-0001 |  |
| PASS | PDF download for LR-2026-0001 is a PDF |  |
| PASS | LR-2026-0001 archived (pdf) + dry-run .eml written under api/storage |  |
| PASS | tools/post-deploy-check.sh exit 0 |  |
| PASS | tienda/ untouched byte-for-byte (all files except the shop chrome + cart mu-plugins) sha=49f623ec386a |  |
| PASS | tienda/wp-content/mu-plugins/arbicop-chrome.php installed, identical to repo |  |
| PASS | tienda/wp-content/mu-plugins/arbicop-shop-cart.php installed, identical to repo |  |
| PASS | tienda/wp-content/mu-plugins/arbicop-chrome/ installed, identical to repo (header, footer, css, manifest) |  |
| PASS | GET /tienda/  body ~ TIENDA-STUB uri=/tienda/ |  |
| PASS | GET /tienda/producto-x/  body ~ TIENDA-STUB uri=/tienda/producto-x/ |  |
| PASS | GET /tienda/wp-content/uploads/2026/01/product.png  -> 200 |  |
| PASS | .well-known/acme-challenge file intact |  |
| PASS | GET /.well-known/acme-challenge/TESTTOKEN123  body ~ ACME-TOKEN-STUB |  |
| PASS | GET /wp-login.php  -> 404 |  |
| PASS | GET /wp-admin/  -> 404 |  |
| PASS | GET /xmlrpc.php  -> 404 |  |
| PASS | GET /wp-content/plugins/elementor/elementor.php  -> 404 |  |
| PASS | GET /error_log  -> 404 |  |
| PASS | GET /beneficios/index.php  -> 404 |  |
| PASS | GET /index.php  -> 404 |  |
| PASS | GET /wp-config.php  -> 404 |  |
| PASS | GET /readme.html  -> 404 |  |
| PASS | GET /license.txt  -> 404 |  |
| PASS | GET /wp-content/uploads/2025/05/evil.php  -> 403 |  |
| PASS | GET /wp-content/uploads/2025/05/logo-old.png  -> 200 |  |
| PASS | GET /beneficios/ -A Googlebot body !~ BOT-MAIL-INDEX-STUB |  |
| PASS | docroot top level == dist/ + {tienda,.well-known,cgi-bin,wp-content} | .htaccess .well-known 404.html api arbitraje assets beneficios cgi-bin conciliacion contacto corretaje favicon.ico index.html libro-de-reclamaciones nosotros peritaje robots.txt sitemap.xml tasacion tienda wp-content  |

## d-redeploy-keeps-runtime-state

| Result | Check | Detail |
|---|---|---|
| PASS | runtime claim created before redeploy -> LR-2026-0002 |  |
| PASS | (sim) new commit pushed + cPanel 'Update from Remote' (git pull) |  |
| PASS | redeploy exit 0 |  |
| PASS | GET /robots.txt  body ~ # redeploy marker |  |
| PASS | api/storage runtime data + config.secret.php byte-identical after redeploy (hash c5eebbd6da4e) |  |
| PASS | config.secret.php unchanged |  |
| PASS | config.secret.php mode still 640 |  |
| PASS | counter.dat unchanged ({"year":2026,"number":2}) |  |
| PASS | archived sheet LR-2026-0002 still present |  |
| PASS | placeholder files overwritten with identical content (cp -R on top is harmless) |  |
| PASS | PDF of LR-2026-0002 still downloadable with its original key after redeploy |  |
| PASS | numbering continues after redeploy: LR-2026-0002 -> LR-2026-0003 |  |
| PASS | GET /api/storage/counter.dat  -> 403 |  |
| PASS | tienda/ untouched byte-for-byte (all files except the shop chrome + cart mu-plugins) sha=49f623ec386a |  |
| PASS | tienda/wp-content/mu-plugins/arbicop-chrome.php installed, identical to repo |  |
| PASS | tienda/wp-content/mu-plugins/arbicop-shop-cart.php installed, identical to repo |  |
| PASS | tienda/wp-content/mu-plugins/arbicop-chrome/ installed, identical to repo (header, footer, css, manifest) |  |
| PASS | GET /tienda/  body ~ TIENDA-STUB uri=/tienda/ |  |
| PASS | GET /tienda/producto-x/  body ~ TIENDA-STUB uri=/tienda/producto-x/ |  |
| PASS | GET /tienda/wp-content/uploads/2026/01/product.png  -> 200 |  |
| PASS | second consecutive redeploy exit 0 (idempotent) |  |
| PASS | state differs from before only by the claim made in this scenario (LR-2026-0003) |  |

## e-rollback

| Result | Check | Detail |
|---|---|---|
| PASS | DEPLOY.md rollback block exit 0 |  |
| PASS | GET /  body ~ LEGACY-WP-HOME uri=/ |  |
| PASS | GET /nosotros/  body ~ LEGACY-WP-HOME uri=/nosotros/ |  |
| PASS | GET /wp-login.php  body ~ LEGACY-WP-STUB wp-login |  |
| PASS | GET /wp-admin/  body ~ LEGACY-WP-ADMIN |  |
| PASS | GET /beneficios/  body ~ LEGACY-BENEFICIOS-OLD-SNAPSHOT |  |
| PASS | GET /wp-content/uploads/2025/05/logo-old.png  -> 200 |  |
| PASS | GET /tienda/  body ~ TIENDA-STUB uri=/tienda/ |  |
| PASS | GET /.well-known/acme-challenge/TESTTOKEN123  body ~ ACME-TOKEN-STUB |  |
| PASS | GET /robots.txt  body ~ LEGACY-WP-HOME uri=/robots.txt |  |
| PASS | api/storage + config.secret.php untouched by rollback (hash 193c299d35a3) |  |
| PASS | config.secret.php identical |  |
| PASS | all 3 archived sheets still on disk |  |
| PASS | every file of the original legacy docroot is back, byte-identical (sha256sum -c) |  |
| PASS | tienda/ untouched by rollback |  |
| PASS | static site and api state saved under respaldos/ (nothing deleted) |  |
| PASS | docroot top level == original legacy top level + api/ (storage + secret only) | .htaccess .well-known api backup-old.zip beneficios cgi-bin error_log index.php license.txt readme.html tienda wp-activate.php wp-admin wp-blog-header.php wp-config-sample.php wp-config.php wp-content wp-cron.php wp-includes wp-load.php wp-login.php wp-settings.php wp-signup.php xmlrpc.php  |

## f-reapply-after-rollback

| Result | Check | Detail |
|---|---|---|
| PASS | cutover block again exit 0 |  |
| PASS | deploy exit 0 |  |
| PASS | postdeploy again exit 0 |  |
| PASS | GET /  -> 200 |  |
| PASS | GET / identical to dist/index.html |  |
| PASS | state still identical after re-applying |  |
| PASS | numbering continues: LR-2026-0003 -> LR-2026-0004 |  |
| PASS | tienda/ untouched byte-for-byte (all files except the shop chrome + cart mu-plugins) sha=49f623ec386a |  |
| PASS | tienda/wp-content/mu-plugins/arbicop-chrome.php installed, identical to repo |  |
| PASS | tienda/wp-content/mu-plugins/arbicop-shop-cart.php installed, identical to repo |  |
| PASS | tienda/wp-content/mu-plugins/arbicop-chrome/ installed, identical to repo (header, footer, css, manifest) |  |
| PASS | GET /tienda/  body ~ TIENDA-STUB uri=/tienda/ |  |
| PASS | GET /tienda/producto-x/  body ~ TIENDA-STUB uri=/tienda/producto-x/ |  |
| PASS | GET /tienda/wp-content/uploads/2026/01/product.png  -> 200 |  |
| PASS | GET /wp-login.php  -> 404 |  |

## g-shop-fix-branch

| Result | Check | Detail |
|---|---|---|
| PASS | shopfix block exit 0 |  |
| PASS | cart mu-plugin moved (not deleted) out of mu-plugins/ |  |
| PASS | rest of tienda/ unchanged |  |
| PASS | chrome mu-plugin file and directory moved (not deleted) out of mu-plugins/ |  |

## h-chrome-kill-switch

| Result | Check | Detail |
|---|---|---|
| PASS | deploy exit 0 (re-installs the moved chrome files) |  |
| PASS | GET /tienda/  body ~ data-arbicop-chrome="header" |  |
| PASS | chromeoff block exit 0 |  |
| PASS | kill switch file created |  |
| PASS | deploy again exit 0 |  |
| PASS | kill switch survives the deploy; chrome files present |  |
| PASS | tienda/ byte-identical with kill switch on |  |
| PASS | GET /tienda/  body !~ data-arbicop-chrome |  |

## Findings from the simulation (what the PASS rows mean in practice)

1. **Stale deploy WITHOUT cutover (b) "works" but leaves the legacy WordPress exposed.** `cp -R dist/.` replaces `.htaccess` (so the old WP rewrites vanish) and `index.html` wins over `index.php` (`DirectoryIndex index.html index.php`), so the new pages render. But, still reachable: `/wp-login.php`, `/xmlrpc.php`, `/index.php` (WordPress home), `/wp-content/plugins/*/*.php` and `/wp-content/uploads/**/*.php`, `/error_log` (plain text, no `.log` extension so the deny rule misses it), and `/beneficios/index.php` still serves `/home/arbicopc/mail/index.html` to bot user agents (cloaking). Conclusion: the cutover (DEPLOY.md step 3) is mandatory, not cosmetic.
2. **Clean account without a shop (a)**: task 1 copies the whole site, task 2 fails (`cp` cannot create into a missing `tienda/wp-content/mu-plugins/`). This is by design (no `mkdir`); on the real server that directory exists (it holds `wp-toolkit.php`). With the directory present (a2) all 4 tasks pass.
3. **`cp -R` over an existing deployment does not damage runtime state (d)**: `dist/` ships no `config.secret.php` and only identical placeholder files in `api/storage`; storage data, `counter.dat`, archived PDFs and `config.secret.php` (mode 640) stay byte-identical, the PDF key of a claim made before the redeploy still works and numbering continues.
4. **Cutover as documented (c)**: leaves only `tienda/`, `.well-known/`, `cgi-bin/`, `wp-content/uploads/` (+ new site); `/tienda/` is byte-identical (all files except the 3 intentionally installed mu-plugins), the ACME file still answers, old `/wp-content/uploads/` images still answer (200) while PHP in uploads is denied (403), the legacy WordPress URLs are 404.
5. **Rollback as documented (e)**: the legacy site answers again (WP rewrite, wp-admin, old beneficios), every original legacy file is byte-identical (`sha256sum -c` against the seed fingerprint), `api/storage` + `config.secret.php` are untouched, and re-applying cutover + deploy (f) continues the claim numbering.
6. `.gitignore` does not drop anything from `dist/` (469 files tracked == 469 on disk in the clone used by the simulation).

## Flaws found while writing the procedure and how they were handled

- **cPanel PHP handler block lives in the legacy root `.htaccess`** (`AddHandler application/x-httpd-ea-php82 ...`); the new `.htaccess` (from `dist/`) does not carry it, and every deploy overwrites `.htaccess`. Mitigation in DEPLOY.md: step 4.2 re-appends the block from the backup, step 4.3 asks to check MultiPHP Manager after each deploy; the lasting fix (ship the block in `src/public/.htaccess`) is left as a decision because it cannot be validated here (the simulation substitutes `application/x-httpd-php`, the real handler name is not understood by this Apache).
- **Legacy `beneficios/` holds two Google Search Console verification files** (`google5d33...html`, `google83cb...html`): moving the whole folder aside would break that verification. DEPLOY.md restores both (inert) files after the deploy (`postdeploy` block, tested).
- **Old image URLs**: `wp-content/uploads/` is deliberately left in place with PHP execution denied instead of shipping 301 rules.
- The first simulation draft cloned the repo as root (permission error) and the PDF/claim checks tripped the "repeated content" rate-limit rule; both were fixed in the harness, not in DEPLOY.md/.cpanel.yml.

## Not verified by this simulation

Real cPanel execution of `.cpanel.yml` (shell, cwd, failure semantics), LiteSpeed (this is Apache 2.4), real PHP handler / MultiPHP, real SMTP and mailbox delivery, izipay in live mode, the real WordPress/WooCommerce (stubs with the real `.htaccess` content), the SSH deploy-key clone from GitHub, real HTTPS/AutoSSL.
