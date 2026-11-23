<?php
/**
 * Pending-delivery markers (storage/pendientes/<claim>.json).
 *
 * A marker exists while ANY of the two notifications (company / consumer) of an archived claim is not delivered.
 * The legal sheet is always archived first; the marker only tells an operator that an e-mail still has to go out
 * (see tools/pendientes.php). Shared by reclamo.php (creates) and the CLI tool (lists, resends, clears).
 */

declare(strict_types=1);

final class Pendientes
{
    /** A notification counts as delivered when it was sent or (test mode) written as a dry-run .eml. */
    public static function delivered(?array $entry): bool
    {
        return in_array($entry['state'] ?? '', ['sent', 'dry_run'], true);
    }

    /** @return string[] which of 'company' / 'consumer' are not delivered */
    public static function missing(array $notifications): array
    {
        $missing = [];
        foreach (['company', 'consumer'] as $who) {
            if (!self::delivered($notifications[$who] ?? null)) {
                $missing[] = $who;
            }
        }
        return $missing;
    }

    public static function dir(string $storage): string
    {
        return $storage . '/pendientes';
    }

    /** Atomic replace (temp file in the same directory + rename). */
    public static function replaceFile(string $path, string $content): bool
    {
        $tmp = $path . '.tmp' . getmypid();
        if (file_put_contents($tmp, $content, LOCK_EX) !== strlen($content) || !rename($tmp, $path)) {
            @unlink($tmp);
            return false;
        }
        return true;
    }

    /**
     * Writes (or refreshes) the marker for a claim, or removes it when nothing is missing any more.
     * @return bool false when the marker could not be written/removed
     */
    public static function sync(string $storage, string $claimNumber, array $notifications): bool
    {
        $dir = self::dir($storage);
        $path = $dir . '/' . $claimNumber . '.json';
        $missing = self::missing($notifications);
        if ($missing === []) {
            return !is_file($path) || @unlink($path);
        }
        $year = substr($claimNumber, 3, 4);
        $marker = json_encode([
            'claim_number' => $claimNumber,
            'pending'      => $missing,                 // which message(s) still have to go out: company, consumer or both
            'company'      => $notifications['company'] ?? null,
            'consumer'     => $notifications['consumer'] ?? null,
            'sheet'        => 'hojas/' . $year . '/' . $claimNumber . '.json',
        ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        if ($marker === false || (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir))) {
            return false;
        }
        return self::replaceFile($path, $marker);
    }
}
