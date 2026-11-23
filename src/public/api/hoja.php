<?php
/**
 * PDF download of an archived Hoja de Reclamación.
 *
 *   GET /api/hoja.php?n=LR-2026-0001&k=<32 hex key>
 *
 * The key is an HMAC of the claim number (see Security::downloadKey), returned only to the person who
 * filed the claim. The file path is built from the validated number, never from user input, and must
 * resolve (realpath) inside storage/hojas/. Every failure answers the same generic 404.
 */

declare(strict_types=1);

ini_set('display_errors', '0');

$config = require __DIR__ . '/config.php';
date_default_timezone_set($config['timezone']);
require_once __DIR__ . '/src/Security.php';

function notFound(): never
{
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    echo 'No encontrado.';
    exit;
}

if (!in_array($_SERVER['REQUEST_METHOD'] ?? '', ['GET', 'HEAD'], true)) {
    http_response_code(405);
    header('Allow: GET, HEAD');
    exit;
}

$number = $_GET['n'] ?? '';
$key = $_GET['k'] ?? '';
if (!is_string($number) || !is_string($key)
    || !preg_match('/^LR-(\d{4})-(\d{4,9})$/', $number, $m)
    || !preg_match('/^[0-9a-f]{32}$/', $key)) {
    notFound();
}

$security = new Security($config);
if (!$security->downloadKeyValid($number, $key)) {
    notFound();
}

$base = realpath($config['storage'] . '/hojas');
$file = $base !== false ? realpath($base . '/' . $m[1] . '/' . $number . '.pdf') : false;
if ($base === false || $file === false || !str_starts_with($file, $base . DIRECTORY_SEPARATOR) || !is_file($file)) {
    notFound();
}

header('Content-Type: application/pdf');
header('Content-Disposition: inline; filename="Hoja-de-Reclamacion-' . $number . '.pdf"');
header('Content-Length: ' . (string) filesize($file));
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    readfile($file);
}
