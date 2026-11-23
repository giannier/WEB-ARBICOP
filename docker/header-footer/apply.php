<?php
// Usage: wp eval-file apply.php root|shop   (files expected in wp-content/uploads/zz-fix2/)
$mode = $args[0] ?? '';
$dir = WP_CONTENT_DIR . '/uploads/zz-fix2/';
$set = function ($pid, $file) use ($dir) {
    $json = file_get_contents($dir . $file);
    if (!json_decode($json)) { echo "BAD JSON $file\n"; return; }
    update_post_meta($pid, '_elementor_data', wp_slash($json));
    delete_post_meta($pid, '_elementor_element_cache');
    delete_post_meta($pid, '_elementor_css');
    echo "set $pid <- $file\n";
};
$mkTpl = function ($title, $type, $file, $cond) use ($dir, $set) {
    $existing = get_posts(['post_type' => 'elementor_library', 'title' => $title, 'post_status' => 'any', 'numberposts' => 1]);
    $id = $existing ? $existing[0]->ID : wp_insert_post(['post_type' => 'elementor_library', 'post_title' => $title, 'post_status' => 'publish']);
    update_post_meta($id, '_elementor_edit_mode', 'builder');
    update_post_meta($id, '_elementor_template_type', $type);
    update_post_meta($id, '_wp_page_template', 'elementor_header_footer');
    update_post_meta($id, '_elementor_version', defined('ELEMENTOR_VERSION') ? ELEMENTOR_VERSION : '3.0.0');
    wp_set_object_terms($id, $type, 'elementor_library_type');
    $set($id, $file);
    update_post_meta($id, '_elementor_conditions', [$cond]);
    return $id;
};
if ($mode === 'root') {
    foreach ([13, 15, 17, 19, 21, 23, 25, 27, 38, 341] as $p) $set($p, "page-$p.json");
    $set(102, 'header.json');
    $set(502, 'footer-wrapped.json');
    $h = $mkTpl('Header Arbicop (page 438)', 'header', 'header.json', 'include/singular/page/438');
    $f = $mkTpl('Footer Arbicop (page 438)', 'footer', 'footer-wrapped.json', 'include/singular/page/438');
    $c = get_option('elementor_pro_theme_builder_conditions', []);
    if (!is_array($c)) $c = [];
    $c['header'][$h] = ['include/singular/page/438'];
    $c['footer'][$f] = ['include/singular/page/438'];
    update_option('elementor_pro_theme_builder_conditions', $c);
    echo "templates header=$h footer=$f\n";
    foreach ([533, 534] as $m) wp_update_post(['ID' => $m, 'post_status' => 'draft']);   // hide menu items, not delete
    echo "menu items 533,534 -> draft\n";
} elseif ($mode === 'shop') {
    $m = wp_get_nav_menu_object('menu-arbicop');
    $mid = $m ? $m->term_id : wp_create_nav_menu('Menu Arbicop');
    $items = [['Inicio', '/', 0], ['Nosotros', '/nosotros/', 0], ['Formaciones', '#', 0], ['Peritaje', '/peritaje/', 1], ['Arbitraje', '/arbitraje/', 1], ['Conciliación', '/conciliacion/', 1], ['Tasación', '/tasacion/', 1], ['Corretaje', '/corretaje/', 1], ['Beneficios', '/beneficios/', 0], ['Tienda', '/tienda/', 0], ['Campus Virtual', 'https://aula.arbicop.com/', 0, '_blank'], ['Contacto', '/contacto/', 0]];
    $parent = 0; $pos = 0;
    if (wp_get_nav_menu_items($mid)) $items = [];   // idempotent: menu already populated
    foreach ($items as $it) {
        $pos++;
        $id = wp_update_nav_menu_item($mid, 0, ['menu-item-title' => $it[0], 'menu-item-type' => 'custom', 'menu-item-object' => 'custom', 'menu-item-url' => $it[1], 'menu-item-status' => 'publish', 'menu-item-position' => $pos, 'menu-item-parent-id' => $it[2] ? $parent : 0, 'menu-item-target' => $it[3] ?? '']);
        if ($it[0] === 'Formaciones') $parent = $id;
    }
    echo "shop menu $mid\n";
    $set(20, 'shop-header.json');
    $set(23, 'shop-footer.json');
}
\Elementor\Plugin::$instance->files_manager->clear_cache();
echo "css cache cleared\n";
