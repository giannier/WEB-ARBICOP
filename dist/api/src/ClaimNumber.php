<?php
/**
 * Consecutive claim numbering (Art. 5, D.S. 011-2011-PCM): no gaps, no
 * duplicates. The counter is protected by an exclusive lock.
 *
 * Two-phase issuance keeps "no gaps" true even when a later step fails: reserve() computes the next number and KEEPS
 * the counter lock; commit() persists it once the sheet is archived; abort() releases the lock without persisting,
 * so the number is handed to the next claim. The lock is held only while the PDF is built and archived (never
 * during SMTP). A crash between archive and commit is covered by the highest-archived-sheet rule below.
 *
 * Fail-closed: if the counter cannot be read or written reliably, no number is
 * issued (an exception is thrown). A missing or corrupt counter is rebuilt from
 * the highest archived sheet of the current year, never silently restarted at 1.
 */

declare(strict_types=1);

final class ClaimNumber
{
    private string $file;
    private string $storage;
    /** @var resource|null counter handle holding LOCK_EX between reserve() and commit()/abort() */
    private $fp = null;
    private int $year = 0;
    private int $pending = 0;

    public function __construct(string $storage)
    {
        if (!is_dir($storage) && !mkdir($storage, 0750, true) && !is_dir($storage)) {
            throw new RuntimeException('Cannot create the storage directory.');
        }
        $this->storage = $storage;
        $this->file = $storage . '/counter.dat';
    }

    /** One-shot issuance (reserve + commit). Prefer reserve()/commit() when later steps can still fail. */
    public function next(): string
    {
        $number = $this->reserve();
        $this->commit();
        return $number;
    }

    /**
     * Next number, NOT yet persisted; the counter stays exclusively locked until commit() or abort().
     * Format: LR-2026-0001 (series restarts every year).
     */
    public function reserve(): string
    {
        if ($this->fp !== null) {
            throw new RuntimeException('A claim number is already reserved.');
        }
        $year = (int) date('Y');
        $fp = fopen($this->file, 'c+');
        if ($fp === false) {
            throw new RuntimeException('Cannot open the claim counter.');
        }
        try {
            if (!flock($fp, LOCK_EX)) {
                throw new RuntimeException('Cannot lock the claim counter.');
            }
            $raw = stream_get_contents($fp);
            if ($raw === false) {
                throw new RuntimeException('Cannot read the claim counter.');
            }
            $state = json_decode($raw, true);
            $valid = is_array($state) && isset($state['year'], $state['number'])
                && is_int($state['year']) && is_int($state['number']) && $state['number'] >= 0;

            if ($valid && $state['year'] === $year) {
                $last = $state['number'];
            } elseif ($valid && $state['year'] < $year) {
                $last = 0; // legitimate yearly reset
            } else {
                // Missing, empty, unparsable or future-year counter: recover from the archive.
                $last = 0;
            }
            // Never go below what is already archived (also covers a stale counter).
            $number = max($last, $this->highestArchived($year)) + 1;

            $this->fp = $fp;
            $this->year = $year;
            $this->pending = $number;
            return sprintf('LR-%d-%04d', $year, $number);
        } catch (Throwable $e) {
            flock($fp, LOCK_UN);
            fclose($fp);
            throw $e;
        }
    }

    /** Persists the reserved number (call once its sheet is archived) and releases the lock. */
    public function commit(): void
    {
        if ($this->fp === null) {
            throw new RuntimeException('No claim number reserved.');
        }
        $fp = $this->fp;
        try {
            $payload = json_encode(['year' => $this->year, 'number' => $this->pending]);
            if ($payload === false || !ftruncate($fp, 0) || !rewind($fp)) {
                throw new RuntimeException('Cannot reset the claim counter.');
            }
            $written = fwrite($fp, $payload);
            if ($written !== strlen($payload) || !fflush($fp)) {
                throw new RuntimeException('Cannot persist the claim counter (short write).');
            }
        } finally {
            $this->close();
        }
    }

    /** Gives the reserved number back (nothing was persisted) and releases the lock. Safe to call any time. */
    public function abort(): void
    {
        $this->close();
    }

    private function close(): void
    {
        if ($this->fp !== null) {
            flock($this->fp, LOCK_UN);
            fclose($this->fp);
            $this->fp = null;
        }
    }

    /** Highest number archived for the year (storage/hojas/<year>/LR-<year>-NNNN.pdf|json; NNNN = at least 4 digits). */
    private function highestArchived(int $year): int
    {
        $dir = $this->storage . '/hojas/' . $year;
        if (!is_dir($dir)) {
            return 0;
        }
        $entries = scandir($dir);
        if ($entries === false) {
            throw new RuntimeException('Cannot scan the archive directory.');
        }
        $max = 0;
        foreach ($entries as $name) {
            if (preg_match('/^LR-' . $year . '-(\d{4,})\.(?:pdf|json)$/', $name, $m)) {
                $max = max($max, (int) $m[1]);
            }
        }
        return $max;
    }
}
