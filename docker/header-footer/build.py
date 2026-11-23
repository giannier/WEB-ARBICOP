"""Builds canonical header/footer JSON from the home page (post 13) Elementor data.
Input : docker/backups/fix2/pre-<id>.json (pre-change dumps), rootkit.json
Output: docker/header-footer/{header,footer,shop-header,shop-footer}.json and pages-<id>.json
"""
import json, copy, re, os
B = 'docker/backups/fix2/'; O = 'docker/header-footer/'
load = lambda p: json.load(open(p, encoding='utf8'))
home = load(B + 'pre-13.json')
kit = load(B + 'rootkit.json')

HEADER = copy.deepcopy(home[:2])                      # top bar + logo/nav bar
FOOTER = copy.deepcopy(next(e for e in home if 'Enlaces' in json.dumps(e)))

def walk(els):
    for e in els:
        yield e
        yield from walk(e.get('elements', []))

def find(els, pred):
    return next(e for e in walk(els) if pred(e))

# ---- R4: remove text links 'Libro de Reclamaciones'
enl = find([FOOTER], lambda e: e.get('widgetType') == 'icon-list' and any(i.get('text') == 'Inicio' for i in e['settings'].get('icon_list', [])))
enl['settings']['icon_list'] = [i for i in enl['settings']['icon_list'] if i.get('text') != 'Libro de Reclamaciones']
bottom = find([FOOTER], lambda e: e.get('widgetType') == 'icon-list' and [i.get('text') for i in e['settings'].get('icon_list', [])] == ['Libro de Reclamaciones'])
bcont = find([FOOTER], lambda e: bottom in e.get('elements', []))
for k in ('hide_desktop', 'hide_tablet', 'hide_mobile'):    # hidden, not deleted
    bcont['settings'][k] = 'hidden-' + k[5:]

# ---- R5: badge under the social icons
badge = find([FOOTER], lambda e: e.get('widgetType') == 'image' and 'AvisoVirtual' in json.dumps(e['settings']))
col_enl = find([FOOTER], lambda e: badge in e.get('elements', []))
col_enl['elements'].remove(badge)
social = find([FOOTER], lambda e: e.get('widgetType') == 'social-icons')
col_soc = find([FOOTER], lambda e: social in e.get('elements', []))
CSS = (
 "selector{width:132px;height:132px;max-width:132px;align-self:flex-start;margin:18px 0 0 0;background:#fff;border-radius:18px;overflow:hidden;"
 "box-shadow:0 6px 18px rgba(0,0,0,.30);transition:transform .25s ease,box-shadow .25s ease}"
 "@media(max-width:767px){selector{align-self:center}}"
 "selector:hover{transform:translateY(-5px);box-shadow:0 12px 26px rgba(0,0,0,.38)}"
 "selector a{display:block;width:100%;height:100%}"
 "selector img{display:block;width:100%;height:100%;max-width:none;object-fit:cover;object-position:50% 48%;transform:scale(1.22);border-radius:0}"
)
badge['settings'] = {
  'image': {'url': '/wp-content/uploads/2026/06/AvisoVirtual_page1.png', 'id': 443, 'size': '', 'alt': 'Libro de Reclamaciones', 'source': 'library'},
  'image_size': 'large', 'link_to': 'custom',
  'link': {'url': '/libro-de-reclamaciones-2/', 'is_external': '', 'nofollow': '', 'custom_attributes': 'aria-label|Libro de Reclamaciones'},
  'custom_css': CSS,
}
col_soc['elements'].append(badge)

def pages_variant(): return HEADER, FOOTER

FOOTER['settings']['custom_css'] = 'selector{font-weight:400}'   # page 438 content leaves unclosed <strong> tags open

# ---- shop variant: resolve Elementor globals of the root kit into explicit values
colors = {c['_id']: c['color'] for c in kit['system_colors'] + kit['custom_colors']}
typos = {t['_id']: t for t in kit['system_typography'] + kit['custom_typography']}
def resolve(els):
    for e in walk(els):
        s = e.get('settings', {}); g = s.get('__globals__')
        if not isinstance(g, dict): continue
        for key, ref in list(g.items()):
            m = re.match(r'globals/(colors|typography)\?id=(\w+)', ref or '')
            if not m: continue
            kind, gid = m.groups()
            if kind == 'colors': s[key] = colors[gid]
            else:
                prefix = key[:-len('typography')]
                for k, v in typos[gid].items():
                    if k.startswith('typography_'): s[prefix + k[len('typography_'):]] = v
                s[key] = 'custom'
            del g[key]
        if not g: s.pop('__globals__', None)
    return els
SH = resolve(copy.deepcopy(HEADER)); SF = resolve(copy.deepcopy([FOOTER]))

dump = lambda n, d: json.dump(d, open(O + n, 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
dump('header.json', HEADER); dump('footer.json', FOOTER); dump('shop-header.json', SH); dump('shop-footer.json', SF)

# ---- per-page copies: replace header (first 2 top-level) and footer container
for pid in (13, 15, 17, 19, 21, 23, 25, 27, 38, 341):
    d = load(B + f'pre-{pid}.json')
    fi = next(k for k, e in enumerate(d) if 'Enlaces' in json.dumps(e))
    assert 'social-icons' in json.dumps(d[0]) and 'nav-menu' in json.dumps(d[1]), pid
    d[fi] = copy.deepcopy(FOOTER); d[0] = copy.deepcopy(HEADER[0]); d[1] = copy.deepcopy(HEADER[1])
    dump(f'page-{pid}.json', d)
print('ok')

# ---- shop only: attachment 452 does not exist in the shop media library, point to the very same
# logo file (already cropped 300x88 by Elementor on the root site) with a site-relative URL.
LOGO = '/wp-content/uploads/elementor/thumbs/cropped-LOGO-ARBICOP-rpdcj3ggugk7usj6ievig5rt2k3s8l9xsct85y4nlc.png'
sh = json.load(open(O + 'shop-header.json', encoding='utf8'))
logo = next(e for e in walk(sh) if e.get('widgetType') == 'image')
logo['settings'] = {'image': {'url': LOGO, 'id': '', 'size': '', 'alt': 'Instituto ARBICOP', 'source': 'library'}, 'image_size': 'full'}
dump('shop-header.json', sh)

# shop only: nav items inherit the body font on the root site (DM Sans) but Montserrat in the shop kit -> pin it.
sh = json.load(open(O + 'shop-header.json', encoding='utf8'))
nav = next(e for e in walk(sh) if e.get('widgetType') == 'nav-menu')
nav['settings']['menu_typography_font_family'] = 'DM Sans'
dump('shop-header.json', sh)
sf = json.load(open(O + 'shop-footer.json', encoding='utf8'))
dump('shop-footer.json', sf)

# footer as a one-element template (used by template 502 and the page-438 footer template)
dump('footer-wrapped.json', [FOOTER])

# shop only: (1) media ids do not exist in the shop DB -> keep site-relative urls only; (2) pin heading typography
# (the shop kit has no h1-h6 rules; the root kit defines them).
def strip_ids(o):
    if isinstance(o, dict):
        if 'url' in o and 'id' in o and o['url']:
            o['id'] = ''
            u = o['url']
            if u.startswith('http://localhost:8082'): o['url'] = u[len('http://localhost:8082'):]
        for v in o.values(): strip_ids(v)
    elif isinstance(o, list):
        for v in o: strip_ids(v)
def pin_headings(els):
    for e in walk(els):
        if e.get('widgetType') != 'heading': continue
        s = e['settings']; s['typography_typography'] = 'custom'
        if s.get('header_size') == 'h4':
            s.update({'typography_font_family': 'Inter', 'typography_font_weight': '700',
                      'typography_font_size': {'unit': 'rem', 'size': 1.2, 'sizes': []}, 'typography_line_height': {'unit': 'em', 'size': 1.1, 'sizes': []}})
        else:
            s.update({'typography_font_family': 'DM Sans', 'typography_font_weight': '400',
                      'typography_font_size': {'unit': 'rem', 'size': 1, 'sizes': []}, 'typography_line_height': {'unit': 'em', 'size': 1, 'sizes': []}})
for n in ('shop-header.json', 'shop-footer.json'):
    d = json.load(open(O + n, encoding='utf8')); pin_headings(d); strip_ids(d); dump(n, d)

# shop only: restore the WooCommerce cart icon (mu-plugin tienda/wp-content/mu-plugins/arbicop-shop-cart.php) as a
# shortcode widget at the right end of the nav row (second top-level container, after the nav-menu widget).
sh = json.load(open(O + 'shop-header.json', encoding='utf8'))
row = sh[1]['elements']
if not any(e.get('widgetType') == 'shortcode' for e in row):
    row.append({'id': 'a1c0c4a7', 'elType': 'widget', 'widgetType': 'shortcode', 'isInner': False,
                'settings': {'shortcode': '[arbicop_cart]'}, 'elements': []})
dump('shop-header.json', sh)
