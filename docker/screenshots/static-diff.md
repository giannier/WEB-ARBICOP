# Static clone vs local WordPress: pixel diff

Generated 2026-11-23T14:28:53.877Z | static http://localhost:8084 vs WP http://localhost:8082

Full-page Chrome screenshots after scrolling the page to trigger lazy loading/animations. "any" = pixels with any channel delta > 0; "tol" = delta > 24/255 on any channel (visible difference). Worst = 100px bands with the most differing pixels.

| page | width | height WP | height static | diff any % | diff tol % | worst bands (y px: % of band) |
|---|---|---|---|---|---|---|
| home | 1440 | 3687 | 3687 | 12.159 | 0.211 | 800: 2.5, 700: 1.22, 200: 0.91 |
| home | 390 | 5769 | 5769 | 0 | 0 | 0: 0, 100: 0, 200: 0 |
| nosotros | 1440 | 2242 | 2242 | 0 | 0 | 0: 0, 100: 0, 200: 0 |
| nosotros | 390 | 3900 | 3900 | 0 | 0 | 0: 0, 100: 0, 200: 0 |
| peritaje | 1440 | 2640 | 2640 | 0 | 0 | 0: 0, 100: 0, 200: 0 |
| peritaje | 390 | 4581 | 4581 | 0 | 0 | 0: 0, 100: 0, 200: 0 |
| arbitraje | 1440 | 2735 | 2735 | 0 | 0 | 0: 0, 100: 0, 200: 0 |
| arbitraje | 390 | 4829 | 4829 | 0 | 0 | 0: 0, 100: 0, 200: 0 |
| conciliacion | 1440 | 2711 | 2711 | 0 | 0 | 0: 0, 100: 0, 200: 0 |
| conciliacion | 390 | 4783 | 4783 | 0 | 0 | 0: 0, 100: 0, 200: 0 |
| tasacion | 1440 | 2727 | 2727 | 0 | 0 | 0: 0, 100: 0, 200: 0 |
| tasacion | 390 | 4776 | 4776 | 0 | 0 | 0: 0, 100: 0, 200: 0 |
| corretaje | 1440 | 2711 | 2711 | 0 | 0 | 0: 0, 100: 0, 200: 0 |
| corretaje | 390 | 4783 | 4783 | 0 | 0 | 0: 0, 100: 0, 200: 0 |
| beneficios | 1440 | 2198 | 2198 | 0 | 0 | 0: 0, 100: 0, 200: 0 |
| beneficios | 390 | 4493 | 4493 | 0 | 0 | 0: 0, 100: 0, 200: 0 |
| contacto | 1440 | 2359 | 2359 | 0 | 0 | 0: 0, 100: 0, 200: 0 |
| contacto | 390 | 3666 | 3666 | 0 | 0 | 0: 0, 100: 0, 200: 0 |
| libro | 1440 | 2451 | 2451 | 0 | 0 | 0: 0, 100: 0, 200: 0 |
| libro | 390 | 4841 | 4841 | 0 | 0 | 0: 0, 100: 0, 200: 0 |

## Console errors (static)
none

## Failed requests (static)
none

## External hosts requested by the static pages
- maps.google.com (contacto:/maps)
- www.google.com (contacto:/maps/embed)
