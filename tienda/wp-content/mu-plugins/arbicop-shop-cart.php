<?php
/**
 * Plugin Name: ARBICOP shop header cart icon
 * Description: Shortcode [arbicop_cart], rendered inside the shop header by arbicop-chrome.php (slot {{shop:cart}}).
 *              Cart link to the WooCommerce cart page with a live item-count badge and (desktop) subtotal, refreshed
 *              by WooCommerce cart fragments (woocommerce_add_to_cart_fragments + wc-cart-fragments). CSS and the
 *              fragments script are only added while the chrome is active (fail-safe: chrome off = shop untouched).
 */
if (!defined('ABSPATH')) exit;

function arbicop_cart_markup() {
    if (!function_exists('WC') || !WC()->cart) return '';
    $count = WC()->cart->get_cart_contents_count();
    $url   = esc_url(wp_make_link_relative(wc_get_cart_url()));
    $label = $count > 0 ? sprintf(_n('Carrito, %d producto', 'Carrito, %d productos', $count, 'arbicop'), $count) : 'Carrito vacío';
    $svg   = '<svg class="arbicop-cart__icon" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>';
    return '<a class="arbicop-cart" href="' . $url . '" aria-label="' . esc_attr($label) . '">' . $svg
        . '<span class="arbicop-cart__count' . ($count ? '' : ' is-empty') . '">' . (int) $count . '</span>'
        . '<span class="arbicop-cart__subtotal">' . WC()->cart->get_cart_subtotal() . '</span></a>';
}
add_shortcode('arbicop_cart', 'arbicop_cart_markup');

// Cart fragment: key = CSS selector replaced client-side by wc-cart-fragments.
add_filter('woocommerce_add_to_cart_fragments', function ($f) {
    $f['a.arbicop-cart'] = arbicop_cart_markup();
    return $f;
});

// Header CSS and the cart-fragments script are only needed when the shop chrome (arbicop-chrome.php) is rendering the header.
function arbicop_cart_chrome_on() { return function_exists('arbicop_chrome_is_active') && arbicop_chrome_is_active(); }

add_action('wp_head', function () { if (!arbicop_cart_chrome_on()) return; ?>
<style id="arbicop-shop-cart">
.elementor-location-header a.arbicop-cart,.arbicop-cart{position:relative;display:inline-flex;align-items:center;gap:10px;color:#030D67;text-decoration:none;font-family:"DM Sans",sans-serif;font-weight:600;font-size:15px;line-height:1;padding:8px 4px;white-space:nowrap}
.elementor-location-header a.arbicop-cart{color:#030D67}
.elementor-location-header a.arbicop-cart:hover,.elementor-location-header a.arbicop-cart:focus-visible{color:#2B9BE8}
.arbicop-cart__icon{display:block;flex:none}
.arbicop-cart__count{position:absolute;top:-2px;left:20px;min-width:18px;height:18px;padding:0 5px;box-sizing:border-box;border-radius:9px;background:#2B9BE8;color:#fff;font-size:11px;font-weight:700;line-height:18px;text-align:center}
.arbicop-cart__count.is-empty{background:#9aa3c7}
/* Cart slot: out of the flex flow so the logo/menu keep exactly the static-site layout; sits in the empty right side of the main bar. */
[data-arbicop-chrome="header"] .e-con-inner{position:relative}
[data-arbicop-chrome="header"] .arbicop-chrome-cart{position:absolute;right:0;top:50%;transform:translateY(-50%);width:auto;margin:0;z-index:2}
@media(max-width:1024px){.arbicop-cart__subtotal{display:none}[data-arbicop-chrome="header"] .arbicop-chrome-cart{right:64px}}
</style>
<?php }, 99);

// WooCommerce 11 no longer loads cart fragments everywhere; the header badge needs them on every shop page.
add_action('wp_enqueue_scripts', function () {
    if (!arbicop_cart_chrome_on()) return;
    if (wp_script_is('wc-cart-fragments', 'registered')) wp_enqueue_script('wc-cart-fragments');
}, 30);
