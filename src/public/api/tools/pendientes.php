<?php
/**
 * Pending e-mail deliveries of the Libro de Reclamaciones (CLI only).
 *
 *   php api/tools/pendientes.php                    list markers in storage/pendientes/ (number, date, state)
 *   php api/tools/pendientes.php --resend LR-2026-0001
 *                                                   re-send the missing message(s) from the archived PDF/JSON with the
 *                                                   live config; updates the delivery state and clears the marker on success
 *
 * Honours LR_MAIL_DRY_RUN / mail_dry_run (writes .eml files instead of sending). Exit code: 0 ok, 1 a resend failed,
 * 2 usage error. Not reachable over HTTP: refuses any non-CLI SAPI, and /api/tools/ is denied by .htaccess.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit;
}

ini_set('display_errors', '1');
error_reporting(E_ALL);

$config = require __DIR__ . '/../config.php';
date_default_timezone_set($config['timezone']);
require_once __DIR__ . '/../src/Notifier.php';
require_once __DIR__ . '/../src/Pendientes.php';

$storage = $config['storage'];
$dir = Pendientes::dir($storage);

function readJson(string $path): ?array
{
    $raw = is_file($path) ? @file_get_contents($path) : false;
    $data = $raw === false ? null : json_decode($raw, true);
    return is_array($data) ? $data : null;
}

function describe(?array $entry): string
{
    return ($entry['state'] ?? '?') . (isset($entry['error_class']) ? ' (' . $entry['error_class'] . ')' : '');
}

function logLine(array $config, string $level, string $message): void
{
    $dir = $config['storage'] . '/log';
    if (is_dir($dir)) {
        @file_put_contents($dir . '/claims.log', sprintf("[%s] %-7s %s\n", date('c'), $level, $message), FILE_APPEND | LOCK_EX);
    }
}

$args = array_slice($argv, 1);

// ---- list -----------------------------------------------------------------------------------------------------
if ($args === []) {
    $files = is_dir($dir) ? (glob($dir . '/LR-*.json') ?: []) : [];
    sort($files);
    printf("Pending deliveries: %d (storage/pendientes/)\n", count($files));
    foreach ($files as $file) {
        $marker = readJson($file);
        if ($marker === null) {
            printf("  %s  unreadable marker\n", basename($file));
            continue;
        }
        $number = (string) ($marker['claim_number'] ?? basename($file, '.json'));
        $sheet = readJson($storage . '/' . (string) ($marker['sheet'] ?? ''));
        $date = (string) ($sheet['date_iso'] ?? date('c', (int) filemtime($file)));
        printf(
            "  %s  %s  missing: %s  company=%s consumer=%s\n",
            $number,
            $date,
            implode('+', (array) ($marker['pending'] ?? Pendientes::missing($marker))),
            describe($marker['company'] ?? null),
            describe($marker['consumer'] ?? null)
        );
    }
    if ($files !== []) {
        echo "Resend with: php api/tools/pendientes.php --resend <number>\n";
    }
    exit(0);
}

// ---- resend ---------------------------------------------------------------------------------------------------
if (count($args) !== 2 || $args[0] !== '--resend' || !preg_match('/^LR-(\d{4})-\d{4,}$/', $args[1], $m)) {
    fwrite(STDERR, "Usage: php api/tools/pendientes.php [--resend LR-YYYY-NNNN]\n");
    exit(2);
}
$number = $args[1];
$base = $storage . '/hojas/' . $m[1] . '/' . $number;
$record = readJson($base . '.json');
$pdf = is_file($base . '.pdf') ? file_get_contents($base . '.pdf') : false;
if ($record === null || $pdf === false) {
    fwrite(STDERR, "$number: archived sheet (PDF/JSON) not found under storage/hojas/{$m[1]}/. Nothing sent.\n");
    exit(1);
}
$notifications = (array) ($record['notifications'] ?? []);
$missing = Pendientes::missing($notifications);
if ($missing === []) {
    Pendientes::sync($storage, $number, $notifications);
    echo "$number: nothing pending (both messages already delivered).\n";
    exit(0);
}

$notifier = new Notifier($config);
$sheet = $record;
unset($sheet['notifications'], $sheet['ip_hash']);
$failed = false;
foreach ($missing as $who) {
    $entry = ['at' => date('c'), 'resent' => true];
    if (!$notifier->configured()) {
        $entry['state'] = 'skipped';
        $entry['error_class'] = 'SmtpNotConfigured';
        $failed = true;
        echo "$number $who: SMTP password missing (config.secret.php); not sent.\n";
    } else {
        try {
            $result = $who === 'company' ? $notifier->sendCompany($sheet, $pdf) : $notifier->sendConsumer($sheet, $pdf);
            $entry['state'] = $notifier->dryRun() ? 'dry_run' : 'sent';
            echo "$number $who: " . ($notifier->dryRun() ? 'DRY-RUN e-mail written to ' . basename($result) : 'sent') . "\n";
            logLine($config, 'OK', "$number $who resent by operator (" . $entry['state'] . ')');
        } catch (Throwable $e) {
            $entry['state'] = 'failed';
            $entry['error_class'] = get_class($e->getPrevious() ?? $e);
            $failed = true;
            echo "$number $who: FAILED (" . $entry['error_class'] . "). See storage/log/claims.log.\n";
            logLine($config, 'ERROR', "$number $who resend failed: " . $e->getMessage());
        }
    }
    $notifications[$who] = $entry;
}

$record['notifications'] = $notifications;
$json = json_encode($record, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
if ($json === false || !Pendientes::replaceFile($base . '.json', $json)) {
    fwrite(STDERR, "$number: could not update the archived delivery state.\n");
    $failed = true;
}
if (!Pendientes::sync($storage, $number, $notifications)) {
    fwrite(STDERR, "$number: could not update the pending marker.\n");
    $failed = true;
}
echo $failed ? "$number: still pending.\n" : "$number: delivered, marker cleared.\n";
exit($failed ? 1 : 0);
