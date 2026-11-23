# Libro de Reclamaciones - e2e results

Run: 2026-11-23T15:35:37.245Z  -  266/266 PASS

| Result | Group | Test | Detail |
|---|---|---|---|
| PASS | PHP 8.4 | GET /libro-de-reclamaciones/ is 200 HTML |  |
| PASS | PHP 8.4 | form posts to /api/reclamo.php, token field empty (issued by api, not static) |  |
| PASS | PHP 8.4 | page has honeypot + no WordPress admin-ajax |  |
| PASS | PHP 8.4 | ubigeo.json served (25 departments incl. SAN MIGUEL/CAJAMARCA) |  |
| PASS | PHP 8.4 | libro.js served |  |
| PASS | PHP 8.4 | token.php issues a 64-hex token + no-store |  |
| PASS | PHP 8.4 | valid submit -> 200 ok, first number is LR-2026-0001 |  |
| PASS | PHP 8.4 | response has download_url |  |
| PASS | PHP 8.4 | PDF text contains claim number |  |
| PASS | PHP 8.4 | PDF text contains hoja title |  |
| PASS | PHP 8.4 | PDF text contains RUC |  |
| PASS | PHP 8.4 | PDF text contains trade name |  |
| PASS | PHP 8.4 | PDF text contains legal name |  |
| PASS | PHP 8.4 | PDF text contains fiscal address |  |
| PASS | PHP 8.4 | PDF text contains consumer name (accents) |  |
| PASS | PHP 8.4 | PDF text contains document |  |
| PASS | PHP 8.4 | PDF text contains phone |  |
| PASS | PHP 8.4 | PDF text contains ubigeo |  |
| PASS | PHP 8.4 | PDF text contains address+reference |  |
| PASS | PHP 8.4 | PDF text contains email |  |
| PASS | PHP 8.4 | PDF text contains bien contratado |  |
| PASS | PHP 8.4 | PDF text contains order |  |
| PASS | PHP 8.4 | PDF text contains amount |  |
| PASS | PHP 8.4 | PDF text contains dates |  |
| PASS | PHP 8.4 | PDF text contains item description |  |
| PASS | PHP 8.4 | PDF text contains type |  |
| PASS | PHP 8.4 | PDF text contains detail |  |
| PASS | PHP 8.4 | PDF text contains request |  |
| PASS | PHP 8.4 | PDF text contains conformity |  |
| PASS | PHP 8.4 | PDF text contains acciones adoptadas |  |
| PASS | PHP 8.4 | PDF text contains 15 dias habiles |  |
| PASS | PHP 8.4 | PDF text contains verification code |  |
| PASS | PHP 8.4 | PDF is exactly 1 page |  |
| PASS | PHP 8.4 | archive JSON: company + consumer notification state=dry_run (separate) |  |
| PASS | PHP 8.4 | archive JSON holds a hashed IP, not the raw IP |  |
| PASS | PHP 8.4 | company .eml: To reclamaciones@arbicop.com, Reply-To consumer, PDF attached |  |
| PASS | PHP 8.4 | consumer .eml: To consumer, Reply-To company, PDF attached |  |
| PASS | PHP 8.4 | company mail is NOT addressed to the consumer (separate messages) |  |
| PASS | PHP 8.4 | no pendientes marker when company mail is ok |  |
| PASS | PHP 8.4 | download_url returns the PDF |  |
| PASS | PHP 8.4 | downloaded bytes equal the archived PDF |  |
| PASS | PHP 8.4 | second claim -> 0002 |  |
| PASS | PHP 8.4 | minor claim -> 0003 |  |
| PASS | PHP 8.4 | minor PDF has guardian block + QUEJA |  |
| PASS | PHP 8.4 | max-length text: nothing trimmed (FINALDETALLE + FINALPEDIDO in PDF, no "recortado") |  |
| PASS | PHP 8.4 | max-length text flows to <= 2 pages |  |
| PASS | PHP 8.4 | counter file holds 4 |  |
| PASS | PHP 8.4 | honeypot filled -> fake success (LR-0000-0000), nothing archived |  |
| PASS | PHP 8.4 | too fast (< min fill) -> 403 |  |
| PASS | PHP 8.4 | missing token -> 403 |  |
| PASS | PHP 8.4 | wrong token -> 403 |  |
| PASS | PHP 8.4 | direct POST without a session -> 403 |  |
| PASS | PHP 8.4 | no Origin/Referer -> 403 |  |
| PASS | PHP 8.4 | cross-origin POST -> 403 |  |
| PASS | PHP 8.4 | GET reclamo.php -> 405 |  |
| PASS | PHP 8.4 | oversized body -> 413 |  |
| PASS | PHP 8.4 | invalid payload -> 422 with per-field errors |  |
| PASS | PHP 8.4 | array-typed field is rejected (422, no PHP error) |  |
| PASS | PHP 8.4 | e-mail header injection attempt rejected |  |
| PASS | PHP 8.4 | e-mail CRLF injection attempt does not create a Bcc (422 or sanitized) |  |
| PASS | PHP 8.4 | repeated identical content within 24 h -> 429 |  |
| PASS | PHP 8.4 | rejections never consumed a number (counter has no gaps) |  |
| PASS | PHP 8.4 | download: wrong key -> 404 |  |
| PASS | PHP 8.4 | download: no key -> 404 |  |
| PASS | PHP 8.4 | download: guessing sibling number with key of #1 -> 404 |  |
| PASS | PHP 8.4 | download: traversal ../../config -> 404 |  |
| PASS | PHP 8.4 | download: traversal with valid prefix -> 404 |  |
| PASS | PHP 8.4 | download: traversal encoded %2e%2e -> 404 |  |
| PASS | PHP 8.4 | download: traversal absolute /etc/passwd -> 404 |  |
| PASS | PHP 8.4 | download: NUL byte -> 404 |  |
| PASS | PHP 8.4 | download: array param -> 404 |  |
| PASS | PHP 8.4 | download: year manipulation -> 404 |  |
| PASS | PHP 8.4 | download: HEAD with valid key is 200 without body |  |
| PASS | PHP 8.4 | download: POST -> 405 |  |
| PASS | PHP 8.4 | 403/404 for /api/config.php |  |
| PASS | PHP 8.4 | 403/404 for /api/config.secret.php |  |
| PASS | PHP 8.4 | 403/404 for /api/config.secret.example.php |  |
| PASS | PHP 8.4 | 403/404 for /api/storage/ |  |
| PASS | PHP 8.4 | 403/404 for /api/storage/counter.dat |  |
| PASS | PHP 8.4 | 403/404 for /api/storage/hojas/2026/LR-2026-0001.pdf |  |
| PASS | PHP 8.4 | 403/404 for /api/storage/hojas/2026/LR-2026-0001.json |  |
| PASS | PHP 8.4 | 403/404 for /api/storage/correo/LR-2026-0001-empresa.eml |  |
| PASS | PHP 8.4 | 403/404 for /api/storage/ratelimit/.salt |  |
| PASS | PHP 8.4 | 403/404 for /api/storage/log/claims.log |  |
| PASS | PHP 8.4 | 403/404 for /api/lib/fpdf/fpdf.php |  |
| PASS | PHP 8.4 | 403/404 for /api/lib/PHPMailer/PHPMailer.php |  |
| PASS | PHP 8.4 | 403/404 for /api/src/Validator.php |  |
| PASS | PHP 8.4 | 403/404 for /api/src/Security.php |  |
| PASS | PHP 8.4 | 403/404 for /api/fonts/OpenSans-Regular.ttf |  |
| PASS | PHP 8.4 | 403/404 for /api/tools/makefont/cp1252.map |  |
| PASS | PHP 8.4 | 403/404 for /api/assets/logo.png |  |
| PASS | PHP 8.4 | 403/404 for /api/README.md |  |
| PASS | PHP 8.4 | 403/404 for /api/storage/hojas/%2e%2e/counter.dat |  |
| PASS | PHP 8.4 | /api/ is not listable |  |
| PASS | PHP 8.4 | php-error.log has no deprecations/warnings/fatals |  |
| PASS | PHP 8.4 | PHP version 8.4.28 |  |
| PASS | PHP 8.4 | no secrets written to storage |  |
| PASS | PHP 8.4 failure injection | REL-001: injected archive failure -> 500, nothing archived, counter unchanged |  |
| PASS | PHP 8.4 failure injection | REL-001: immediate retry with identical content succeeds (no 429) and gets the SAME number the failed try had |  |
| PASS | PHP 8.4 failure injection | REL-001: after the successful retry the content fingerprint is kept (a third identical submit -> 429) |  |
| PASS | PHP 8.4 failure injection | REL-001: failure line in claims.log carries the claim number and "returned to the pool" |  |
| PASS | PHP 8.4 failure injection | REL-002: injected PDF failure -> 500, counter did not move |  |
| PASS | PHP 8.4 failure injection | REL-002: next successful claim receives the number the PDF failure did not archive (no gap) |  |
| PASS | PHP 8.4 failure injection | REL-002: injected archive failure -> 500, counter did not move |  |
| PASS | PHP 8.4 failure injection | REL-002: next successful claim receives the number the archive failure did not archive (no gap) |  |
| PASS | PHP 8.4 failure injection | REL-002: archived sheets are exactly 1..counter (no gap, no duplicate) |  |
| PASS | PHP 8.4 failure injection | REL-002: 5 parallel submissions all succeed with 5 distinct numbers |  |
| PASS | PHP 8.4 failure injection | REL-002: the 5 parallel numbers are consecutive, counter == last, still no gaps |  |
| PASS | PHP 8.4 failure injection | RES-002: company e-mail failure -> 200, claim archived |  |
| PASS | PHP 8.4 failure injection | RES-002: user message reassures and gives comercial@arbicop.com + WhatsApp +51 943 704 298 |  |
| PASS | PHP 8.4 failure injection | RES-002: message exposes no internals (no SMTP/injected/exception text) |  |
| PASS | PHP 8.4 failure injection | RES-002: archive JSON: company=failed, consumer=dry_run |  |
| PASS | PHP 8.4 failure injection | RES-002: marker written with pending=["company"] |  |
| PASS | PHP 8.4 failure injection | RES-002: consumer .eml exists, company .eml does not |  |
| PASS | PHP 8.4 failure injection | RES-002: consumer-only failure -> 200 + marker with pending=["consumer"] |  |
| PASS | PHP 8.4 failure injection | RES-002: CLI list shows both pending claims (number, date, missing, state) |  |
| PASS | PHP 8.4 failure injection | RES-002: CLI rejects a malformed claim number (exit 2) |  |
| PASS | PHP 8.4 failure injection | RES-002: --resend (dry-run) exits 0, clears the marker, writes the company .eml, state updated |  |
| PASS | PHP 8.4 failure injection | RES-002: --resend of the consumer-only marker clears it and writes the consumer .eml |  |
| PASS | PHP 8.4 failure injection | RES-002: resending a claim with nothing pending is a no-op (exit 0) |  |
| PASS | PHP 8.4 failure injection | RES-002: resending an unknown claim fails cleanly (exit 1, nothing sent) |  |
| PASS | PHP 8.4 failure injection | RES-002: CLI list no longer shows the resent claims |  |
| PASS | PHP 8.4 failure injection | RES-002: web request to /api/tools/pendientes.php -> 403, no output |  |
| PASS | PHP 8.4 failure injection | failure injection off again: normal claim succeeds with no marker |  |
| PASS | PHP 8.4 failure injection | php-error.log still has no deprecations/warnings/fatals after the failure paths |  |
| PASS | PHP 8.4 post-deploy-check | RES-001: tools/post-deploy-check.sh exits 0 and every check PASSes |  |
| PASS | PHP 8.4 post-deploy-check | RES-001: script prints the PHP version header and the MultiPHP hint |  |
| PASS | PHP 8.1 | GET /libro-de-reclamaciones/ is 200 HTML |  |
| PASS | PHP 8.1 | form posts to /api/reclamo.php, token field empty (issued by api, not static) |  |
| PASS | PHP 8.1 | page has honeypot + no WordPress admin-ajax |  |
| PASS | PHP 8.1 | ubigeo.json served (25 departments incl. SAN MIGUEL/CAJAMARCA) |  |
| PASS | PHP 8.1 | libro.js served |  |
| PASS | PHP 8.1 | token.php issues a 64-hex token + no-store |  |
| PASS | PHP 8.1 | valid submit -> 200 ok, first number is LR-2026-0001 |  |
| PASS | PHP 8.1 | response has download_url |  |
| PASS | PHP 8.1 | PDF text contains claim number |  |
| PASS | PHP 8.1 | PDF text contains hoja title |  |
| PASS | PHP 8.1 | PDF text contains RUC |  |
| PASS | PHP 8.1 | PDF text contains trade name |  |
| PASS | PHP 8.1 | PDF text contains legal name |  |
| PASS | PHP 8.1 | PDF text contains fiscal address |  |
| PASS | PHP 8.1 | PDF text contains consumer name (accents) |  |
| PASS | PHP 8.1 | PDF text contains document |  |
| PASS | PHP 8.1 | PDF text contains phone |  |
| PASS | PHP 8.1 | PDF text contains ubigeo |  |
| PASS | PHP 8.1 | PDF text contains address+reference |  |
| PASS | PHP 8.1 | PDF text contains email |  |
| PASS | PHP 8.1 | PDF text contains bien contratado |  |
| PASS | PHP 8.1 | PDF text contains order |  |
| PASS | PHP 8.1 | PDF text contains amount |  |
| PASS | PHP 8.1 | PDF text contains dates |  |
| PASS | PHP 8.1 | PDF text contains item description |  |
| PASS | PHP 8.1 | PDF text contains type |  |
| PASS | PHP 8.1 | PDF text contains detail |  |
| PASS | PHP 8.1 | PDF text contains request |  |
| PASS | PHP 8.1 | PDF text contains conformity |  |
| PASS | PHP 8.1 | PDF text contains acciones adoptadas |  |
| PASS | PHP 8.1 | PDF text contains 15 dias habiles |  |
| PASS | PHP 8.1 | PDF text contains verification code |  |
| PASS | PHP 8.1 | PDF is exactly 1 page |  |
| PASS | PHP 8.1 | archive JSON: company + consumer notification state=dry_run (separate) |  |
| PASS | PHP 8.1 | archive JSON holds a hashed IP, not the raw IP |  |
| PASS | PHP 8.1 | company .eml: To reclamaciones@arbicop.com, Reply-To consumer, PDF attached |  |
| PASS | PHP 8.1 | consumer .eml: To consumer, Reply-To company, PDF attached |  |
| PASS | PHP 8.1 | company mail is NOT addressed to the consumer (separate messages) |  |
| PASS | PHP 8.1 | no pendientes marker when company mail is ok |  |
| PASS | PHP 8.1 | download_url returns the PDF |  |
| PASS | PHP 8.1 | downloaded bytes equal the archived PDF |  |
| PASS | PHP 8.1 | second claim -> 0002 |  |
| PASS | PHP 8.1 | minor claim -> 0003 |  |
| PASS | PHP 8.1 | minor PDF has guardian block + QUEJA |  |
| PASS | PHP 8.1 | max-length text: nothing trimmed (FINALDETALLE + FINALPEDIDO in PDF, no "recortado") |  |
| PASS | PHP 8.1 | max-length text flows to <= 2 pages |  |
| PASS | PHP 8.1 | counter file holds 4 |  |
| PASS | PHP 8.1 | honeypot filled -> fake success (LR-0000-0000), nothing archived |  |
| PASS | PHP 8.1 | too fast (< min fill) -> 403 |  |
| PASS | PHP 8.1 | missing token -> 403 |  |
| PASS | PHP 8.1 | wrong token -> 403 |  |
| PASS | PHP 8.1 | direct POST without a session -> 403 |  |
| PASS | PHP 8.1 | no Origin/Referer -> 403 |  |
| PASS | PHP 8.1 | cross-origin POST -> 403 |  |
| PASS | PHP 8.1 | GET reclamo.php -> 405 |  |
| PASS | PHP 8.1 | oversized body -> 413 |  |
| PASS | PHP 8.1 | invalid payload -> 422 with per-field errors |  |
| PASS | PHP 8.1 | array-typed field is rejected (422, no PHP error) |  |
| PASS | PHP 8.1 | e-mail header injection attempt rejected |  |
| PASS | PHP 8.1 | e-mail CRLF injection attempt does not create a Bcc (422 or sanitized) |  |
| PASS | PHP 8.1 | repeated identical content within 24 h -> 429 |  |
| PASS | PHP 8.1 | rejections never consumed a number (counter has no gaps) |  |
| PASS | PHP 8.1 | download: wrong key -> 404 |  |
| PASS | PHP 8.1 | download: no key -> 404 |  |
| PASS | PHP 8.1 | download: guessing sibling number with key of #1 -> 404 |  |
| PASS | PHP 8.1 | download: traversal ../../config -> 404 |  |
| PASS | PHP 8.1 | download: traversal with valid prefix -> 404 |  |
| PASS | PHP 8.1 | download: traversal encoded %2e%2e -> 404 |  |
| PASS | PHP 8.1 | download: traversal absolute /etc/passwd -> 404 |  |
| PASS | PHP 8.1 | download: NUL byte -> 404 |  |
| PASS | PHP 8.1 | download: array param -> 404 |  |
| PASS | PHP 8.1 | download: year manipulation -> 404 |  |
| PASS | PHP 8.1 | download: HEAD with valid key is 200 without body |  |
| PASS | PHP 8.1 | download: POST -> 405 |  |
| PASS | PHP 8.1 | 403/404 for /api/config.php |  |
| PASS | PHP 8.1 | 403/404 for /api/config.secret.php |  |
| PASS | PHP 8.1 | 403/404 for /api/config.secret.example.php |  |
| PASS | PHP 8.1 | 403/404 for /api/storage/ |  |
| PASS | PHP 8.1 | 403/404 for /api/storage/counter.dat |  |
| PASS | PHP 8.1 | 403/404 for /api/storage/hojas/2026/LR-2026-0001.pdf |  |
| PASS | PHP 8.1 | 403/404 for /api/storage/hojas/2026/LR-2026-0001.json |  |
| PASS | PHP 8.1 | 403/404 for /api/storage/correo/LR-2026-0001-empresa.eml |  |
| PASS | PHP 8.1 | 403/404 for /api/storage/ratelimit/.salt |  |
| PASS | PHP 8.1 | 403/404 for /api/storage/log/claims.log |  |
| PASS | PHP 8.1 | 403/404 for /api/lib/fpdf/fpdf.php |  |
| PASS | PHP 8.1 | 403/404 for /api/lib/PHPMailer/PHPMailer.php |  |
| PASS | PHP 8.1 | 403/404 for /api/src/Validator.php |  |
| PASS | PHP 8.1 | 403/404 for /api/src/Security.php |  |
| PASS | PHP 8.1 | 403/404 for /api/fonts/OpenSans-Regular.ttf |  |
| PASS | PHP 8.1 | 403/404 for /api/tools/makefont/cp1252.map |  |
| PASS | PHP 8.1 | 403/404 for /api/assets/logo.png |  |
| PASS | PHP 8.1 | 403/404 for /api/README.md |  |
| PASS | PHP 8.1 | 403/404 for /api/storage/hojas/%2e%2e/counter.dat |  |
| PASS | PHP 8.1 | /api/ is not listable |  |
| PASS | PHP 8.1 | php-error.log has no deprecations/warnings/fatals |  |
| PASS | PHP 8.1 | PHP version 8.1.34 |  |
| PASS | PHP 8.1 | no secrets written to storage |  |
| PASS | PHP 8.1 failure injection | REL-001: injected archive failure -> 500, nothing archived, counter unchanged |  |
| PASS | PHP 8.1 failure injection | REL-001: immediate retry with identical content succeeds (no 429) and gets the SAME number the failed try had |  |
| PASS | PHP 8.1 failure injection | REL-001: after the successful retry the content fingerprint is kept (a third identical submit -> 429) |  |
| PASS | PHP 8.1 failure injection | REL-001: failure line in claims.log carries the claim number and "returned to the pool" |  |
| PASS | PHP 8.1 failure injection | REL-002: injected PDF failure -> 500, counter did not move |  |
| PASS | PHP 8.1 failure injection | REL-002: next successful claim receives the number the PDF failure did not archive (no gap) |  |
| PASS | PHP 8.1 failure injection | REL-002: injected archive failure -> 500, counter did not move |  |
| PASS | PHP 8.1 failure injection | REL-002: next successful claim receives the number the archive failure did not archive (no gap) |  |
| PASS | PHP 8.1 failure injection | REL-002: archived sheets are exactly 1..counter (no gap, no duplicate) |  |
| PASS | PHP 8.1 failure injection | REL-002: 5 parallel submissions all succeed with 5 distinct numbers |  |
| PASS | PHP 8.1 failure injection | REL-002: the 5 parallel numbers are consecutive, counter == last, still no gaps |  |
| PASS | PHP 8.1 failure injection | RES-002: company e-mail failure -> 200, claim archived |  |
| PASS | PHP 8.1 failure injection | RES-002: user message reassures and gives comercial@arbicop.com + WhatsApp +51 943 704 298 |  |
| PASS | PHP 8.1 failure injection | RES-002: message exposes no internals (no SMTP/injected/exception text) |  |
| PASS | PHP 8.1 failure injection | RES-002: archive JSON: company=failed, consumer=dry_run |  |
| PASS | PHP 8.1 failure injection | RES-002: marker written with pending=["company"] |  |
| PASS | PHP 8.1 failure injection | RES-002: consumer .eml exists, company .eml does not |  |
| PASS | PHP 8.1 failure injection | RES-002: consumer-only failure -> 200 + marker with pending=["consumer"] |  |
| PASS | PHP 8.1 failure injection | RES-002: CLI list shows both pending claims (number, date, missing, state) |  |
| PASS | PHP 8.1 failure injection | RES-002: CLI rejects a malformed claim number (exit 2) |  |
| PASS | PHP 8.1 failure injection | RES-002: --resend (dry-run) exits 0, clears the marker, writes the company .eml, state updated |  |
| PASS | PHP 8.1 failure injection | RES-002: --resend of the consumer-only marker clears it and writes the consumer .eml |  |
| PASS | PHP 8.1 failure injection | RES-002: resending a claim with nothing pending is a no-op (exit 0) |  |
| PASS | PHP 8.1 failure injection | RES-002: resending an unknown claim fails cleanly (exit 1, nothing sent) |  |
| PASS | PHP 8.1 failure injection | RES-002: CLI list no longer shows the resent claims |  |
| PASS | PHP 8.1 failure injection | RES-002: web request to /api/tools/pendientes.php -> 403, no output |  |
| PASS | PHP 8.1 failure injection | failure injection off again: normal claim succeeds with no marker |  |
| PASS | PHP 8.1 failure injection | php-error.log still has no deprecations/warnings/fatals after the failure paths |  |
| PASS | PHP 8.1 post-deploy-check | RES-001: tools/post-deploy-check.sh exits 0 and every check PASSes |  |
| PASS | PHP 8.1 post-deploy-check | RES-001: script prints the PHP version header and the MultiPHP hint |  |
| PASS | Rate limit | with production limits a submit after 6 s works |  |
| PASS | Rate limit | production min fill (6 s): 3 s is too fast -> 403 |  |
| PASS | Rate limit | second claim from same IP within 30 min -> 429 (rate limit) |  |
| PASS | Rate limit | 429 message points to reclamaciones@arbicop.com |  |
| PASS | Rate limit post-deploy-check | RES-001: tools/post-deploy-check.sh exits 0 and every check PASSes |  |
| PASS | Rate limit post-deploy-check | RES-001: script prints the PHP version header and the MultiPHP hint |  |
| PASS | Rate limit (30 min slot) slot release | REL-001: archive failure -> 500 and the limiter holds NO reservation (ips/global/dups empty) |  |
| PASS | Rate limit (30 min slot) slot release | REL-001: retry right away succeeds with interval=30 min and per_day=1 (no 429), same number |  |
| PASS | Rate limit (30 min slot) slot release | REL-001: after a SUCCESS the slot stays reserved (another claim from the same IP -> 429) |  |
| PASS | Rate limit (30 min slot) slot release | REL-001: PDF failure also releases the slot; retry succeeds and takes the next number |  |
| PASS | Rate limit (30 min slot) post-deploy-check | RES-001: tools/post-deploy-check.sh exits 0 and every check PASSes |  |
| PASS | Rate limit (30 min slot) post-deploy-check | RES-001: script prints the PHP version header and the MultiPHP hint |  |
