# Fix delta: shop chrome review (REL-001 / RES-001 / READ-001)

Finding (CRITICAL, deterministic): `arbicop_chrome_boot_elementor()` in `tienda/wp-content/mu-plugins/arbicop-chrome.php` used
`class_exists('ElementorPlugin')`, `ElementorPlugin::$instance` and an unqualified `catch (Throwable ...)`, so the block never ran and the
`catch` hid it. On shop pages without Elementor content the chrome did not boot Elementor's frontend.

## Work unit 1 (one atomic unit, one rollback boundary)

| File | Change |
|---|---|
| `tienda/wp-content/mu-plugins/arbicop-chrome.php` | `\Elementor\Plugin` (class_exists + `::$instance` x2), `catch (\Throwable ...)` |
| `tools/check-chrome.mjs` (new) | static guard: namespace typos, `php -l` through Docker, chrome manifest checksums; wired into `npm run check` |
| `tools/check-chrome-live.mjs` (new) | live check against the real local WP shop (Elementor frontend loaded + real hover/click on cart, checkout, my-account, empty search) |
| `package.json` | `check` = check-assets + check-chrome |

Rollback boundary: `git revert` of the `fix(shop)` commit (and the `test:` guard commit); local volume copy: restore
`D:\TRABAJO\RESPALDOS\arbicop\limpieza-2026-11-23\review-fix-shop\tienda\wp-content\mu-plugins\arbicop-chrome.php` with `docker cp` + `apachectl -k graceful`.
Backups of every touched file: `D:\TRABAJO\RESPALDOS\arbicop\limpieza-2026-11-23\review-fix-shop\` (also `live-before.txt` / `live-after.txt`).

## Evidence (local WP shop, real Chrome/CDP)

Before the fix, `/tienda/my-account/` (no Elementor content) loaded 1 Elementor-related script (only smartmenus): `elementorFrontend` undefined,
hover and hamburger inert (3 FAIL in `live-before.txt`). After: 9 scripts (webpack runtime, frontend-modules, frontend, pro runtime/frontend/handlers,
smartmenus, chunks), all checks PASS in `live-after.txt`. Cart, checkout (with one item, no payment) and the empty search already loaded Elementor
before the fix because their own page templates contain Elementor widgets, so they were not affected.
Earlier note "my-account threw elementorFrontendConfig is not defined": that came from a first version that enqueued the `elementor-frontend` handle
directly (script without config). It was replaced by the boot function, whose namespace typo then left my-account without Elementor frontend; my earlier
interaction tests only covered /tienda/ and the product page, never my-account.
