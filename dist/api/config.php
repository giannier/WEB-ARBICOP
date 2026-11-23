<?php
/**
 * Libro de Reclamaciones (ARBICOP) - configuration. NO secrets in this file.
 *
 * Credentials live ONLY in api/config.secret.php (git-ignored, created on the server).
 * See config.secret.example.php.
 */

declare(strict_types=1);

// --- Secrets -------------------------------------------------------------
$secrets = [
    'smtp_password'     => '',
    'hcaptcha_site_key' => '',
    'hcaptcha_secret'   => '',
    'mail_dry_run'      => false,
];
if (is_file(__DIR__ . '/config.secret.php')) {
    $loaded = require __DIR__ . '/config.secret.php';
    if (is_array($loaded)) {
        foreach ($secrets as $key => $default) {
            if (isset($loaded[$key]) && gettype($loaded[$key]) === gettype($default)) {
                $secrets[$key] = $loaded[$key];
            }
        }
    }
}

// Test switch: build + archive the PDF and write both e-mails to storage/correo/
// instead of sending them. Also enabled by env LR_MAIL_DRY_RUN=1.
$dryRun = $secrets['mail_dry_run'] || getenv('LR_MAIL_DRY_RUN') === '1';

$limits = [
    'interval_seconds' => 1800,  // 1 claim per IP every 30 min
    'per_day'          => 5,     // and 5 per IP per 24 h
    'global_per_hour'  => 20,
    'global_per_day'   => 80,
    'min_fill_seconds' => 6,     // faster than this = bot
    'token_ttl'        => 7200,
];

// Test-only: relax the limits through env LR_TEST_LIMITS (JSON). Ignored unless dry-run is on,
// so a stray variable can never weaken a production setup that really sends mail.
if ($dryRun && is_string(getenv('LR_TEST_LIMITS')) && getenv('LR_TEST_LIMITS') !== '') {
    $override = json_decode((string) getenv('LR_TEST_LIMITS'), true);
    if (is_array($override)) {
        foreach ($limits as $key => $default) {
            if (isset($override[$key]) && is_int($override[$key])) {
                $limits[$key] = $override[$key];
            }
        }
    }
}

// Test-only failure injection (e2e): LR_TEST_FAIL=archive|pdf|smtp-company|smtp-consumer (comma list), or the same
// words in the file storage/.test-fail (lets a test toggle it between requests). Honoured ONLY when dry-run AND
// LR_TEST_LIMITS are on, so it can never fire in a production setup that really sends mail.
$testFail = [];
$testLimitsOn = is_string(getenv('LR_TEST_LIMITS')) && getenv('LR_TEST_LIMITS') !== '';
if ($dryRun && $testLimitsOn) {
    $raw = (string) getenv('LR_TEST_FAIL');
    $flagFile = __DIR__ . '/storage/.test-fail';
    if ($raw === '' && is_file($flagFile)) {
        $raw = (string) @file_get_contents($flagFile);
    }
    foreach (explode(',', $raw) as $word) {
        $word = trim($word);
        if (in_array($word, ['archive', 'pdf', 'smtp-company', 'smtp-consumer'], true)) {
            $testFail[] = $word;
        }
    }
}

return [

    // Provider data printed on every Hoja de Reclamación (Art. 5, D.S. 011-2011-PCM).
    'provider' => [
        'trade_name' => 'ARBICOP',
        // TODO verify against the escritura / SUNAT ficha RUC: the SUNAT text was truncated, the legal form
        // suffix ("SOCIEDAD POR ACCIONES CERRADA SIMPLIFICADA") is inferred.
        'legal_name' => 'INSTITUTO DE FORMACION DE PERITOS, ARBITROS, CONCILIADORES, TASADORES Y CORREDORES SOCIEDAD POR ACCIONES CERRADA SIMPLIFICADA',
        'ruc'        => '20614105829',
        'address'    => 'JR. AYACUCHO NRO. 1326 URB. CHACHAPOYAS AMAZONAS - CHACHAPOYAS - CHACHAPOYAS',
        'web'        => 'arbicop.com',
        'phone'      => '+51 943 704 298',
        'contact_email' => 'comercial@arbicop.com',                  // general contact (not the complaints inbox)
        'logo'       => __DIR__ . '/assets/logo.png',                // cropped header logo
    ],

    'smtp' => [
        'host'        => 'mail.arbicop.com',                         // TODO: confirm host in cPanel
        'port'        => 465,
        'security'    => 'ssl',                                      // 465 = implicit SSL; 587 would be 'tls'
        // Dedicated mailbox for the complaint book (must exist in cPanel).
        'username'    => 'reclamaciones@arbicop.com',
        'password'    => $secrets['smtp_password'],
        'from_name'   => 'ARBICOP - Libro de Reclamaciones',
        'internal_bcc' => 'reclamaciones@arbicop.com',               // company notification recipient
        'verify_certificate' => true,
        'timeout'     => 20,
        'dry_run'     => $dryRun,
    ],

    // hCaptcha is enabled only when both keys are present in config.secret.php.
    'captcha' => [
        'site_key'        => $secrets['hcaptcha_site_key'],
        'secret'          => $secrets['hcaptcha_secret'],
        'domain'          => 'arbicop.com',
        'allow_localhost' => false,
    ],

    'limits' => $limits,
    'test_fail' => $testFail,

    // Ley 31435 amended art. 24 of Ley 29571: 15 business days (TODO: legal review of the exact wording).
    'response_business_days' => 15,

    'storage'         => __DIR__ . '/storage',
    'retention_years' => 2,           // Art. 12, D.S. 011-2011-PCM
    'timezone'        => 'America/Lima',
];
