<?php
/**
 * Plugin Name: ARBICOP shop chrome (header/footer from the repo)
 * Description: Renders the SAME header and footer as the static site on the shop (/tienda). The markup is generated
 *              by `npm run build` from src/layouts into arbicop-chrome/ (header.html, footer.html, chrome.css,
 *              manifest.json) and deployed with cp. No database writes: the shop's own Elementor theme-builder
 *              header/footer and Hello's default header/footer are only bypassed at render time.
 *
 * FAIL-SAFE: this file does NOTHING (the shop keeps its original header/footer) when
 *   - the constant ARBICOP_CHROME_DISABLE is true (wp-config.php), or
 *   - the file arbicop-chrome.off exists next to this file, or
 *   - arbicop-chrome/manifest.json or any generated partial is missing, unreadable, invalid or does not match the
 *     checksums in the manifest (half-finished deploy), or a static asset listed in the manifest is not in the docroot.
 * It never touches wp-admin, wp-login, ajax, REST, feeds, the Elementor editor/preview or Elementor Canvas pages.
 * Every callback is wrapped so a failure falls back to the original header/footer and never prints PHP errors.
 */
if (!defined('ABSPATH')) exit;

if (!function_exists('arbicop_chrome_config')) {

    /** Validated manifest + partials, or null when the chrome must stay off. Cached per request. */
    function arbicop_chrome_config() {
        static $cfg = false;
        if ($cfg !== false) return $cfg;
        $cfg = null;
        try {
            if (defined('ARBICOP_CHROME_DISABLE') && ARBICOP_CHROME_DISABLE) return $cfg;
            if (@file_exists(__DIR__ . '/arbicop-chrome.off')) return $cfg;
            $dir = __DIR__ . '/arbicop-chrome/';
            $raw = @file_get_contents($dir . 'manifest.json');
            if (!is_string($raw) || $raw === '') return $cfg;
            $m = json_decode($raw, true);
            if (!is_array($m) || ($m['version'] ?? 0) !== 1 || empty($m['hash']) || !preg_match('/^[a-f0-9]{8,64}$/', (string) $m['hash'])) return $cfg;
            if (empty($m['files']) || !is_array($m['files']) || empty($m['css']) || !is_array($m['css'])) return $cfg;
            $parts = [];
            foreach (['header.html', 'footer.html', 'chrome.css'] as $name) {
                $txt = @file_get_contents($dir . $name);
                if (!is_string($txt) || $txt === '' || empty($m['files'][$name]) || !hash_equals((string) $m['files'][$name], hash('sha256', $txt))) return $cfg;
                $parts[$name] = $txt;
            }
            if (strpos($parts['header.html'], 'data-arbicop-chrome="header"') === false || strpos($parts['footer.html'], 'data-arbicop-chrome="footer"') === false) return $cfg;
            // Static assets (shipped by the static deploy into the docroot) must exist, or the header would render unstyled.
            $roots = [dirname(rtrim(ABSPATH, '/\\'))];
            if (!empty($_SERVER['DOCUMENT_ROOT'])) $roots[] = rtrim($_SERVER['DOCUMENT_ROOT'], '/\\');
            $docroot = null;
            foreach ($roots as $r) {
                if (@is_file($r . '/assets/css/fonts.css')) { $docroot = $r; break; }
            }
            if ($docroot === null) return $cfg;
            foreach ((array) ($m['requires'] ?? []) as $rel) {
                if (!is_string($rel) || strpos($rel, '..') !== false || $rel === '' || $rel[0] !== '/' || !@is_file($docroot . $rel)) return $cfg;
            }
            $cfg = ['manifest' => $m, 'header' => $parts['header.html'], 'footer' => $parts['footer.html'], 'kit' => $parts['chrome.css']];
        } catch (\Throwable $e) {
            $cfg = null;
        }
        return $cfg;
    }

    /** True only for a normal front-end page view where the chrome is configured and healthy. */
    function arbicop_chrome_is_active() {
        try {
            if (arbicop_chrome_config() === null) return false;
            if (is_admin() || (function_exists('wp_doing_ajax') && wp_doing_ajax()) || (function_exists('wp_doing_cron') && wp_doing_cron())) return false;
            if ((defined('REST_REQUEST') && REST_REQUEST) || (defined('XMLRPC_REQUEST') && XMLRPC_REQUEST) || (defined('WP_CLI') && WP_CLI)) return false;
            if (function_exists('wp_is_json_request') && wp_is_json_request()) return false;
            global $pagenow;
            if (in_array($pagenow, ['wp-login.php', 'wp-signup.php', 'wp-activate.php', 'wp-comments-post.php', 'xmlrpc.php', 'wp-cron.php'], true)) return false;
            // Query-dependent checks only exist once the main query ran; before that stay off.
            if (!did_action('wp')) return false;
            if ((function_exists('is_customize_preview') && is_customize_preview()) || is_feed() || is_robots() || is_embed() || is_trackback()) return false;
            if (isset($_GET['elementor-preview']) || isset($_GET['elementor_library'])) return false;
            if (class_exists('\Elementor\Plugin') && !empty(\Elementor\Plugin::$instance)) {
                $e = \Elementor\Plugin::$instance;
                if (isset($e->preview) && $e->preview->is_preview_mode()) return false;
                if (isset($e->editor) && $e->editor->is_edit_mode()) return false;
            }
            if (is_singular() && get_page_template_slug() === 'elementor_canvas') return false;   // Canvas = intentionally no header/footer
            return true;
        } catch (\Throwable $e) {
            return false;
        }
    }

    // 1) Bypass the shop's own header/footer (render time only, no DB writes).
    add_filter('hello_elementor_header_footer', function ($show) {
        return arbicop_chrome_is_active() ? false : $show;
    }, 99);
    add_filter('elementor/theme/get_location_templates/template_id', function ($id, $location = '') {
        // A non-existing template id makes Elementor Pro skip the header/footer theme-builder templates.
        return (($location === 'header' || $location === 'footer') && arbicop_chrome_is_active()) ? 0 : $id;
    }, 99, 2);

    // 2) Assets.
    add_action('wp_enqueue_scripts', function () {
        try {
            if (!arbicop_chrome_is_active()) return;
            $m = arbicop_chrome_config()['manifest'];
            $ver = rawurlencode((string) $m['hash']);
            $prev = [];
            // WordPress prefixes root-relative style URLs with the shop URL, so build the docroot URL from the site origin.
            $u = wp_parse_url(home_url('/'));
            $origin = ($u['scheme'] ?? 'https') . '://' . ($u['host'] ?? '') . (!empty($u['port']) ? ':' . $u['port'] : '');
            foreach ($m['css'] as $css) {
                if (!is_array($css) || empty($css['id'])) continue;
                $handle = $css['handle'] ?? '';
                if ($handle !== '' && wp_style_is($handle, 'registered')) {   // the shop's own, version-matched widget stylesheet
                    wp_enqueue_style($handle);
                    $prev[] = $handle;
                    continue;
                }
                if (empty($css['src'])) continue;
                $h = 'arbicop-chrome-' . preg_replace('/[^a-z0-9_-]/i', '', $css['id']);
                wp_enqueue_style($h, $origin . $css['src'] . '?v=' . $ver, $prev ? [end($prev)] : [], null);
                $prev[] = $h;
            }
        } catch (\Throwable $e) {
        }
    }, 20);
    // Scoped root kit CSS goes last in <head> so it wins over the shop kit at equal specificity.
    add_action('wp_head', function () {
        try {
            if (!arbicop_chrome_is_active()) return;
            echo '<style id="arbicop-chrome-kit">' . arbicop_chrome_config()['kit'] . '</style>' . "\n";
            echo '<style id="arbicop-chrome-fix">[data-arbicop-chrome="header"]{position:relative;z-index:50}[data-arbicop-chrome] a{text-decoration:none}</style>' . "\n";
        } catch (\Throwable $e) {
        }
    }, 100);

    // Pages without Elementor content never boot Elementor's frontend (no config, no handlers), but the nav menu needs it:
    // do what Elementor does itself in its wp_footer callback, then add the nav-menu dependency (smartmenus) from the manifest.
    function arbicop_chrome_boot_elementor() {
        try {
            $m = arbicop_chrome_config()['manifest'];
            if (class_exists('ElementorPlugin') && !empty(ElementorPlugin::$instance->frontend)) {
                $f = ElementorPlugin::$instance->frontend;
                if (!$f->has_elementor_in_page()) {
                    $f->enqueue_styles();
                    $f->enqueue_scripts();
                }
            }
            foreach ((array) ($m['js'] ?? []) as $handle) {
                if (is_string($handle) && wp_script_is($handle, 'registered')) wp_enqueue_script($handle);
            }
        } catch (Throwable $e) {
        }
    }

    // 3) Markup.
    function arbicop_chrome_cart_html() {
        try {
            if (!function_exists('shortcode_exists') || !shortcode_exists('arbicop_cart')) return '';
            return (string) do_shortcode('[arbicop_cart]');
        } catch (\Throwable $e) {
            return '';
        }
    }

    function arbicop_chrome_print_header() {
        static $done = false;
        try {
            if ($done || !arbicop_chrome_is_active()) return;
            $html = str_replace('{{shop:cart}}', arbicop_chrome_cart_html(), arbicop_chrome_config()['header']);
            $done = true;
            echo $html . "\n";   // phpcs:ignore WordPress.Security.EscapeOutput -- trusted, repo-generated markup
        } catch (\Throwable $e) {
        }
    }
    add_action('wp_body_open', 'arbicop_chrome_print_header', 20);

    add_action('wp_footer', function () {
        try {
            if (!arbicop_chrome_is_active()) return;
            arbicop_chrome_boot_elementor();
            // Safety net: a theme that never calls wp_body_open() still gets the header (moved to the top by JS).
            if (!did_action('wp_body_open')) {
                ob_start();
                arbicop_chrome_print_header();
                $h = ob_get_clean();
                if ($h) echo '<div id="arbicop-chrome-late-header">' . $h . '</div><script>(function(){var n=document.getElementById("arbicop-chrome-late-header");if(n&&document.body)document.body.insertBefore(n,document.body.firstChild)})()</script>';
            }
            echo arbicop_chrome_config()['footer'] . "\n";   // phpcs:ignore WordPress.Security.EscapeOutput
        } catch (\Throwable $e) {
        }
    }, 1);
}
