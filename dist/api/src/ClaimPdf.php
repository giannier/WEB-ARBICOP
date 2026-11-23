<?php
/**
 * Builds the one-page "Hoja de Reclamación" PDF.
 *
 * Structure follows Art. 5 of D.S. 011-2011-PCM (minimum content).
 * Typography: Montserrat Bold for titles and labels, Open Sans for body text (SIL OFL). The TTFs are embedded (see api/fonts/).
 *
 * ONE PAGE when possible: the consumer's text has variable length, so the document is built
 * and the pages counted; if it overflows it is rebuilt with a smaller body
 * size. If it still overflows the sheet continues on a second page (text is never trimmed).
 */

declare(strict_types=1);

define('FPDF_FONTPATH', __DIR__ . '/../fonts/');
require_once __DIR__ . '/../lib/fpdf/fpdf.php';

final class ClaimPdf extends FPDF
{
    private array $provider;
    private array $sheet;
    private float $body;           // body font size in points
    private int $responseDays;

    // ARBICOP palette: navy #062250 (Elementor kit) and sky blue #2B9BE8 (logo accent).
    // Constant names are historical: PURPLE = primary (navy), AMBER = accent (blue).
    private const PURPLE = [6, 34, 80];
    private const AMBER  = [43, 155, 232];
    private const INK    = [28, 33, 46];
    private const GRAY   = [102, 110, 124];
    private const LINE   = [214, 223, 236];
    private const TINT   = [239, 245, 252];

    private const MARGIN = 12.0;

    public function __construct(array $provider, array $sheet, int $responseDays, float $body = 8.6)
    {
        parent::__construct('P', 'mm', 'A4');

        $this->provider = $provider;
        $this->sheet = $sheet;
        $this->body = $body;
        $this->responseDays = $responseDays;

        $this->AddFont('Montserrat', '', 'Montserrat-Regular.php');
        $this->AddFont('Montserrat', 'B', 'Montserrat-Bold.php');
        $this->AddFont('OpenSans', '', 'OpenSans-Regular.php');
        $this->AddFont('OpenSans', 'B', 'OpenSans-Bold.php');

        $this->SetMargins(self::MARGIN, self::MARGIN, self::MARGIN);
        $this->SetAutoPageBreak(true, self::MARGIN);
        $this->SetTitle($this->t('Hoja de Reclamación ' . ($sheet['claim_number'] ?? '')));
        $this->SetAuthor($this->t($provider['trade_name']));
        $this->SetCreator($provider['web']);
    }

    /**
     * Returns the PDF as a binary string.
     *
     * @param array{pages:int,body:float,trimmed:bool}|null $audit
     */
    public static function generate(array $provider, array $sheet, int $responseDays, ?array &$audit = null): string
    {
        foreach ([8.6, 8.2, 7.8, 7.4, 7.0] as $body) {
            $pdf = new self($provider, $sheet, $responseDays, $body);
            $pdf->build();
            if ($pdf->PageNo() === 1) {
                $audit = ['pages' => 1, 'body' => $body, 'trimmed' => false];
                return $pdf->Output('S');
            }
        }

        // Very long statements: keep ALL the consumer's text and let the sheet flow onto a second page.
        // Trimming a legal document is never acceptable (the archive must hold what was declared).
        $pdf = new self($provider, $sheet, $responseDays, 7.0);
        $pdf->build();
        $audit = ['pages' => $pdf->PageNo(), 'body' => 7.0, 'trimmed' => false];
        return $pdf->Output('S');
    }

    // ---------------------------------------------------------------------

    public function build(): void
    {
        $this->AddPage();
        $this->titleBlock();
        $this->providerBlock();
        $this->consumerBlock();
        if (!empty($this->sheet['is_minor'])) {
            $this->guardianBlock();
        }
        $this->itemBlock();
        $this->detailBlock();
        $this->providerActionsBlock();
        $this->legalFooter();
    }

    private function titleBlock(): void
    {
        $w = $this->usableWidth();
        $m = self::MARGIN;

        // Logo (left) and subtitle (right) on white
        $logo = $this->provider['logo'] ?? '';
        if ($logo !== '' && is_file($logo)) {
            $this->Image($logo, $m, $m, 46);
        }
        $this->SetTextColor(...self::GRAY);
        $this->SetFont('OpenSans', '', 7.6);
        $this->SetXY($m + $w - 100, $m + 3);
        $this->Cell(100, 4, $this->t('Libro de Reclamaciones virtual · Ley 29571 · D.S. 011-2011-PCM'), 0, 2, 'R');
        $this->Cell(100, 4, $this->t($this->provider['web']), 0, 0, 'R');

        // Title band
        $y = $m + 11;
        $this->SetFillColor(...self::PURPLE);
        $this->Rect($m, $y, $w, 11, 'F');
        $this->SetFillColor(...self::AMBER);
        $this->Rect($m, $y + 11, $w, 1.1, 'F');

        $this->SetTextColor(255, 255, 255);
        $this->SetFont('Montserrat', 'B', 12);
        $this->SetXY($m + 3, $y + 2.6);
        $this->Cell(95, 6, $this->t('HOJA DE RECLAMACIÓN'), 0, 0, 'L');

        $this->SetFont('Montserrat', 'B', 9.5);
        $this->SetXY($m + $w - 83, $y + 3);
        $this->Cell(80, 5, $this->t('N.° ' . $this->sheet['claim_number']), 0, 0, 'R');

        // Date row
        $y2 = $y + 12.1;
        $this->SetFillColor(...self::TINT);
        $this->SetDrawColor(...self::LINE);
        $this->Rect($m, $y2, $w, 7.5, 'FD');
        $this->SetTextColor(...self::GRAY);
        $this->SetFont('OpenSans', '', 8);
        $this->SetXY($m + 3, $y2 + 1.7);
        $this->Cell($w - 6, 4.2, $this->t('Fecha y hora de registro y envío: ' . $this->sheet['date_long']), 0, 0, 'L');

        $this->SetY($y2 + 7.5);
    }

    private function section(string $title): void
    {
        $this->Ln(1.8);
        $this->SetFillColor(...self::PURPLE);
        $this->SetTextColor(255, 255, 255);
        $this->SetFont('Montserrat', 'B', 7.4);
        $this->Cell($this->usableWidth(), 5, ' ' . $this->t(mb_strtoupper($title)), 0, 1, 'L', true);
        $this->Ln(1.4);
        $this->SetTextColor(...self::INK);
    }

    /** Label/value row, one or two columns. */
    private function field(string $label, string $value, float $width = 0, bool $newLine = true): void
    {
        $width = $width ?: $this->usableWidth();
        $labelWidth = 33.0;
        $y = $this->GetY();
        $x = $this->GetX();

        $this->SetFont('Montserrat', 'B', $this->body - 0.8);
        $this->SetTextColor(...self::GRAY);
        $this->Cell($labelWidth, 4.6, $this->t($label), 0, 0, 'L');

        $this->SetFont('OpenSans', '', $this->body);
        $this->SetTextColor(...self::INK);
        $this->MultiCell($width - $labelWidth, 4.6, $this->t($value !== '' ? $value : '—'), 0, 'L');
        $yEnd = $this->GetY();

        if (!$newLine) {
            $this->SetXY($x + $width, $y);
        } else {
            $this->SetXY(self::MARGIN, max($yEnd, $y + 4.6));
        }
    }

    private function providerBlock(): void
    {
        $p = $this->provider;
        $half = $this->usableWidth() / 2;
        $this->section('1. Identificación del proveedor');
        $this->field('Razón social', $p['legal_name']);
        $this->field('Nombre comercial', $p['trade_name'], $half, false);
        $this->field('RUC', $p['ruc']);
        $this->field('Domicilio fiscal', $p['address']);
    }

    private function consumerBlock(): void
    {
        $h = $this->sheet;
        $half = $this->usableWidth() / 2;
        $this->section('2. Identificación del consumidor reclamante');
        $this->field('Nombre completo', $h['name']);
        $this->field('Documento', $h['document_type'] . ' ' . $h['document_number'], $half, false);
        $this->field('Celular', $h['phone']);
        $this->field('Ubicación', $h['district'] . ', ' . $h['province'] . ', ' . $h['department']);
        $this->field('Dirección', $h['address'] . ($h['reference'] !== '' ? ' (Ref.: ' . $h['reference'] . ')' : ''));
        $this->field('Correo', $h['email']);
    }

    private function guardianBlock(): void
    {
        $h = $this->sheet;
        $half = $this->usableWidth() / 2;
        $this->section('2.1 Padre, madre o tutor (consumidor menor de edad)');
        $this->field('Nombre completo', $h['guardian_name']);
        $this->field('Documento', $h['guardian_document_type'] . ' ' . $h['guardian_document_number'], $half, false);
        $this->field('Correo', $h['guardian_email']);
    }

    private function itemBlock(): void
    {
        $h = $this->sheet;
        $half = $this->usableWidth() / 2;
        $this->section('3. Identificación del bien contratado');
        $this->field('Tipo', $h['item_type'], $half, false);
        $this->field('N.° de pedido', $h['order_number']);
        $this->field(
            'Monto reclamado',
            $h['amount'] !== null ? 'S/ ' . number_format((float) $h['amount'], 2) : 'No indica'
        );
        $dates = [];
        foreach (['purchase_date' => 'Compra', 'consumption_date' => 'Consumo', 'expiry_date' => 'Caducidad'] as $k => $l) {
            if (($h[$k] ?? '') !== '') {
                $dates[] = $l . ': ' . $this->dmy($h[$k]);
            }
        }
        if ($dates !== []) {
            $this->field('Fechas', implode('   ·   ', $dates));
        }
        $this->field('Descripción', $h['item_description']);
    }

    private function detailBlock(): void
    {
        $h = $this->sheet;
        $isClaim = $h['claim_type'] === 'Reclamo';
        $w = $this->usableWidth();

        $this->section('4. Detalle de la reclamación o queja y pedido del consumidor');

        $this->SetFont('Montserrat', 'B', $this->body + 0.6);
        $this->SetTextColor(...self::AMBER);
        $this->Cell(24, 5, $this->t(mb_strtoupper($h['claim_type'])), 0, 0, 'L');

        $this->SetFont('OpenSans', '', $this->body - 0.8);
        $this->SetTextColor(...self::GRAY);
        $this->MultiCell($w - 24, 3.6, $this->t($isClaim
            ? 'Reclamo: disconformidad relacionada con los productos o servicios.'
            : 'Queja: disconformidad no relacionada con los productos o servicios, o malestar por la atención al público.'), 0, 'L');
        $this->Ln(1.4);

        $this->SetTextColor(...self::INK);
        $this->SetFont('Montserrat', 'B', $this->body - 0.6);
        $this->Cell($w, 4.4, $this->t('Detalle'), 0, 1, 'L');
        $this->SetFont('OpenSans', '', $this->body);
        $this->MultiCell($w, 4.0, $this->t($h['detail']), 0, 'J');

        $this->Ln(1.6);
        $this->SetFont('Montserrat', 'B', $this->body - 0.6);
        $this->Cell($w, 4.4, $this->t('Pedido del consumidor'), 0, 1, 'L');
        $this->SetFont('OpenSans', '', $this->body);
        $this->MultiCell($w, 4.0, $this->t($h['request']), 0, 'J');

        $this->Ln(1.6);
        $this->SetFont('Montserrat', 'B', $this->body - 0.6);
        $this->Cell($w, 4.4, $this->t('Conformidad del consumidor (reemplaza la firma)'), 0, 1, 'L');
        $this->SetFont('OpenSans', '', $this->body - 0.4);
        $this->MultiCell($w, 3.8, $this->t(
            'El consumidor declaró ser el titular del bien contratado y aceptó el contenido de esta hoja bajo '
            . 'declaración jurada de veracidad, y aceptó la política de privacidad, el '
            . $h['date_long'] . '.'
        ), 0, 'J');
    }

    private function providerActionsBlock(): void
    {
        $this->section('5. Observaciones y acciones adoptadas por el proveedor');
        $y = $this->GetY();

        // The box stretches down to the legal footer so there is real room to
        // write the answer if someone completes a printed copy.
        $footerHeight = 30.0;
        $available = $this->GetPageHeight() - self::MARGIN - $footerHeight - $y;
        $height = max(14.0, min($available, 80.0));

        $this->SetDrawColor(...self::LINE);
        $this->SetFillColor(...self::TINT);
        $this->Rect(self::MARGIN, $y, $this->usableWidth(), $height, 'FD');

        $this->SetFont('OpenSans', '', $this->body - 0.6);
        $this->SetTextColor(...self::GRAY);
        $this->SetXY(self::MARGIN + 2.5, $y + 2);
        $this->MultiCell($this->usableWidth() - 5, 3.6, $this->t(
            'Espacio reservado para la respuesta del proveedor, que será remitida al correo '
            . 'del consumidor dentro del plazo legal.'
        ), 0, 'L');

        $this->SetY($y + $height + 2.5);
    }

    private function legalFooter(): void
    {
        $this->SetDrawColor(...self::LINE);
        $this->Line(self::MARGIN, $this->GetY(), self::MARGIN + $this->usableWidth(), $this->GetY());
        $this->Ln(1.6);

        $this->SetFont('OpenSans', '', $this->body - 1.2);
        $this->SetTextColor(...self::GRAY);
        $this->SetX(self::MARGIN);
        $this->MultiCell($this->usableWidth(), 3.2, $this->t(sprintf(
            'La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito '
            . 'previo para interponer una denuncia ante el INDECOPI. El proveedor debe dar respuesta en un plazo no '
            . 'mayor de %d días hábiles (Ley 29571, art. 24, modificado por la Ley 31435). Esta hoja se conserva por '
            . 'dos años desde su registro (D.S. 011-2011-PCM). El consumidor autoriza ser contactado después de la '
            . 'tramitación para evaluar la calidad de la atención. Registrada por medio virtual: la aceptación '
            . 'declarada reemplaza la firma.',
            $this->responseDays
        )), 0, 'J');

        $this->Ln(1);
        $this->SetFont('Montserrat', 'B', $this->body - 1.6);
        $this->SetTextColor(...self::PURPLE);
        $this->SetX(self::MARGIN);
        $this->Cell($this->usableWidth(), 3.6, $this->t(
            'Documento generado automáticamente por ' . $this->provider['web']
            . ' · Código de verificación: ' . $this->sheet['verification']
        ), 0, 1, 'L');
    }

    /** 2026-11-23 -> 23/11/2026 */
    private function dmy(string $iso): string
    {
        $d = DateTimeImmutable::createFromFormat('!Y-m-d', $iso);
        return $d !== false ? $d->format('d/m/Y') : $iso;
    }

    private function usableWidth(): float
    {
        return $this->GetPageWidth() - (self::MARGIN * 2);
    }

    /** The embedded fonts use cp1252 encoding (Spanish accents, n-tilde, ¿ ¡). */
    private function t(string $text): string
    {
        return mb_convert_encoding($text, 'Windows-1252', 'UTF-8');
    }
}
