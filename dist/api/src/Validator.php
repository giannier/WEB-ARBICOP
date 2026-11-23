<?php
/**
 * Validation and sanitizing of the Hoja de Reclamación fields
 * (Art. 5, D.S. 011-2011-PCM). Field names are those of the original ARBICOP form
 * (WordPress plugin "libro-de-reclamaciones-y-quejas"); error messages are user-facing Spanish.
 * Nothing reaches the PDF or the e-mail without passing through here.
 *
 * The cleaned data uses English keys (name, document_type, claim_type, detail, ...).
 */

declare(strict_types=1);

final class Validator
{
    /** @var array<string,string> errors keyed by the POSTED field name */
    private array $errors = [];

    /** @var array<string,mixed> */
    private array $clean = [];

    private const DOC_TYPES = ['DNI', 'CE', 'Pasaporte', 'RUC'];
    private const ITEM_TYPES = ['Producto', 'Servicio'];
    private const CLAIM_TYPES = ['Reclamo', 'Queja'];
    private const MULTILINE = ['detail', 'request', 'item_description'];

    // detail/request caps are what lets the sheet fit one A4 page (see ClaimPdf).
    private const MAX = [
        'first_name' => 80, 'last_name1' => 60, 'last_name2' => 60, 'document_number' => 20,
        'address' => 200, 'reference' => 150, 'phone' => 25, 'email' => 120,
        'guardian_name' => 120, 'guardian_email' => 120, 'guardian_document_number' => 20,
        'department' => 40, 'province' => 60, 'district' => 60,
        'order_number' => 40, 'item_description' => 300, 'detail' => 1800, 'request' => 700,
    ];

    /** @var array<string,array<string,list<string>>>|null department => province => districts */
    private ?array $ubigeo = null;

    public function __construct(?string $ubigeoFile = null)
    {
        $file = $ubigeoFile ?? __DIR__ . '/../../assets/data/ubigeo.json';
        $raw = is_file($file) ? file_get_contents($file) : false;
        $data = $raw !== false ? json_decode($raw, true) : null;
        if (is_array($data)) {
            $map = [];
            foreach ($data as $dep) {
                foreach ($dep['p'] ?? [] as $prov) {
                    $map[(string) $dep['n']][(string) $prov['n']] = array_map('strval', $prov['d'] ?? []);
                }
            }
            $this->ubigeo = $map;
        }
    }

    public function validate(array $post): bool
    {
        $this->errors = [];
        $this->clean = [];

        $this->text($post, 'nombres', 'first_name', 'Nombre', true);
        $this->text($post, 'paterno', 'last_name1', 'Primer apellido', true);
        $this->text($post, 'materno', 'last_name2', 'Segundo apellido', true);
        $this->clean['name'] = trim(implode(' ', [
            $this->clean['first_name'], $this->clean['last_name1'], $this->clean['last_name2'],
        ]));

        $this->choice($post, 'tipo_doc', 'document_type', 'el tipo de documento', self::DOC_TYPES);
        $this->documentNumber($post, 'nro_doc', 'document_number', $this->clean['document_type']);
        $this->phone($post, 'cel', 'phone', 'Celular');
        $this->ubigeo($post);
        $this->text($post, 'direccion', 'address', 'Dirección', true);
        $this->text($post, 'referencia', 'reference', 'Referencia', false);
        $this->email($post, 'correo', 'email', 'Correo electrónico', true);

        $flag = (string) ($post['flag_menor'] ?? '');
        if (!in_array($flag, ['0', '1'], true)) {
            $this->errors['flag_menor'] = 'Indica si eres menor de edad.';
        }
        $minor = $flag === '1';
        $this->clean['is_minor'] = $minor;
        if ($minor) {
            $this->text($post, 'nombre_tutor', 'guardian_name', 'Nombre del padre, madre o tutor', true);
            $this->email($post, 'correo_tutor', 'guardian_email', 'Correo del padre, madre o tutor', true);
            $this->choice($post, 'tipo_doc_tutor', 'guardian_document_type', 'el tipo de documento del tutor', self::DOC_TYPES);
            $this->documentNumber($post, 'nro_doc_tutor', 'guardian_document_number', $this->clean['guardian_document_type']);
        } else {
            foreach (['guardian_name', 'guardian_email', 'guardian_document_type', 'guardian_document_number'] as $f) {
                $this->clean[$f] = '';
            }
        }

        $this->choice($post, 'tipo_reclamo', 'claim_type', 'el tipo de reclamo', self::CLAIM_TYPES);
        $this->choice($post, 'tipo_consumo', 'item_type', 'el tipo de consumo', self::ITEM_TYPES);
        $this->text($post, 'nro_pedido', 'order_number', 'El número de pedido', false);
        $this->amount($post);
        $this->text($post, 'descripcion', 'item_description', 'La descripción del producto o servicio', true);
        $this->date($post, 'fch_compra', 'purchase_date', 'La fecha de compra');
        $this->date($post, 'fch_consumo', 'consumption_date', 'La fecha de consumo');
        $this->date($post, 'fch_vencimiento', 'expiry_date', 'La fecha de caducidad');
        $this->text($post, 'detalle_reclamo', 'detail', 'El detalle', true, 20);
        $this->text($post, 'pedido_cliente', 'request', 'El pedido del consumidor', true, 10);

        // In the virtual book the declaration replaces the signature (Art. 5).
        if (empty($post['acepto'])) {
            $this->errors['acepto'] = 'Debes aceptar la declaración jurada para continuar.';
        }
        $this->clean['consent_truth'] = true;
        if (empty($post['politica'])) {
            $this->errors['politica'] = 'Debes aceptar la política de privacidad.';
        }
        $this->clean['consent_privacy'] = true;

        return $this->errors === [];
    }

    public function errors(): array { return $this->errors; }
    public function data(): array   { return $this->clean; }

    private function text(array $p, string $in, string $out, string $label, bool $required, int $min = 2): void
    {
        $raw = $p[$in] ?? '';
        if (!is_string($raw)) { // arrays (e.g. name[]=x) are never valid
            $this->errors[$in] = $label . ' no es válido.';
            $this->clean[$out] = '';
            return;
        }
        if (!mb_check_encoding($raw, 'UTF-8')) {
            $this->errors[$in] = $label . ' contiene caracteres no válidos.';
            $this->clean[$out] = '';
            return;
        }

        $v = $this->normalize($raw);
        // Only multi-line fields keep line breaks; the rest is single-line, so no
        // CR/LF can ever reach a mail header.
        if (!in_array($out, self::MULTILINE, true)) {
            $v = trim(preg_replace('/\s+/u', ' ', $v) ?? '');
        }

        if ($v === '') {
            if ($required) {
                $this->errors[$in] = $label . ' es obligatorio.';
            }
            $this->clean[$out] = '';
            return;
        }

        // Typical spam signals: many links, HTML anchors, BBCode.
        if (preg_match_all('~(?:https?://|www\.)~i', $v) > 2
            || stripos($v, '<a ') !== false || stripos($v, '[url=') !== false) {
            $this->errors[$in] = $label . ' no puede incluir enlaces.';
            $this->clean[$out] = '';
            return;
        }

        if (mb_strlen($v) < $min) {
            $this->errors[$in] = $label . ' es demasiado corto.';
        }
        $max = self::MAX[$out] ?? 300;
        if (mb_strlen($v) > $max) {
            $v = mb_substr($v, 0, $max);
        }
        $this->clean[$out] = $v;
    }

    private function choice(array $p, string $in, string $out, string $label, array $valid): void
    {
        $raw = $p[$in] ?? '';
        $v = is_string($raw) ? trim($raw) : '';
        if (!in_array($v, $valid, true)) {
            $this->errors[$in] = 'Selecciona ' . $label . '.';
            $this->clean[$out] = '';
            return;
        }
        $this->clean[$out] = $v;
    }

    private function documentNumber(array $p, string $in, string $out, string $type): void
    {
        $raw = $p[$in] ?? '';
        $v = preg_replace('/[^A-Za-z0-9]/', '', is_string($raw) ? $raw : '') ?? '';

        if ($v === '') {
            $this->errors[$in] = 'El número de documento es obligatorio.';
            $this->clean[$out] = '';
            return;
        }

        $lengths = ['DNI' => [8, 8], 'RUC' => [11, 11], 'CE' => [8, 12], 'Pasaporte' => [6, 12]];
        [$min, $max] = $lengths[$type] ?? [5, 20];
        $n = strlen($v);
        if ($n < $min || $n > $max) {
            $this->errors[$in] = $type === 'DNI'
                ? 'El DNI debe tener 8 dígitos.'
                : sprintf('El número de %s debe tener entre %d y %d caracteres.', $type ?: 'documento', $min, $max);
        }
        if (in_array($type, ['DNI', 'RUC'], true) && !ctype_digit($v)) {
            $this->errors[$in] = 'El ' . $type . ' solo admite números.';
        }
        $this->clean[$out] = strtoupper(substr($v, 0, self::MAX['document_number']));
    }

    private function phone(array $p, string $in, string $out, string $label): void
    {
        $raw = $p[$in] ?? '';
        $v = $this->normalize(is_string($raw) ? $raw : '');
        if ($v === '') {
            $this->errors[$in] = $label . ' es obligatorio.';
            $this->clean[$out] = '';
            return;
        }
        if (!preg_match('/^[+]?[0-9()\s.-]{6,25}$/', $v)) {
            $this->errors[$in] = $label . ' no tiene un formato válido.';
            $v = '';
        }
        $this->clean[$out] = $v;
    }

    private function email(array $p, string $in, string $out, string $label, bool $required): void
    {
        $raw = $p[$in] ?? '';
        // A line break inside an address would allow mail header injection.
        $v = str_replace(["\r", "\n", "\0", '%0a', '%0d'], '', trim(is_string($raw) ? $raw : ''));
        if ($v === '') {
            if ($required) {
                $this->errors[$in] = $label . ' es obligatorio.';
            }
            $this->clean[$out] = '';
            return;
        }
        if (!filter_var($v, FILTER_VALIDATE_EMAIL) || mb_strlen($v) > self::MAX['email']) {
            $this->errors[$in] = $label . ' no es válido.';
            $this->clean[$out] = '';
            return;
        }
        $this->clean[$out] = mb_strtolower($v);
    }

    private function amount(array $p): void
    {
        $raw = $p['monto_reclamado'] ?? '';
        $raw = is_string($raw) ? trim($raw) : '';
        if ($raw === '') {
            $this->clean['amount'] = null; // optional
            return;
        }
        $raw = str_replace([',', ' '], ['.', ''], $raw);
        if (!is_numeric($raw) || (float) $raw < 0 || (float) $raw > 9999999) {
            $this->errors['monto_reclamado'] = 'El monto reclamado no es válido.';
            $this->clean['amount'] = null;
            return;
        }
        $this->clean['amount'] = round((float) $raw, 2);
    }

    /** Optional ISO date (YYYY-MM-DD, as sent by <input type="date">), not in the far future. */
    private function date(array $p, string $in, string $out, string $label): void
    {
        $raw = $p[$in] ?? '';
        $v = is_string($raw) ? trim($raw) : '';
        $this->clean[$out] = '';
        if ($v === '') {
            return;
        }
        $d = DateTimeImmutable::createFromFormat('!Y-m-d', $v);
        $ok = $d !== false && $d->format('Y-m-d') === $v
            && (int) $d->format('Y') >= 2000 && (int) $d->format('Y') <= (int) date('Y') + 10;
        if (!$ok) {
            $this->errors[$in] = $label . ' no es válida.';
            return;
        }
        $this->clean[$out] = $v;
    }

    /** Department / province / district must be consistent with the static ubigeo data. */
    private function ubigeo(array $p): void
    {
        $get = static fn(string $k): string => is_string($p[$k] ?? null) ? trim(preg_replace('/\s+/u', ' ', $p[$k]) ?? '') : '';
        $dep = $get('dep');
        $prov = $get('prov');
        $dist = $get('dist');
        $this->clean['department'] = $this->clean['province'] = $this->clean['district'] = '';

        if ($dep === '') {
            $this->errors['dep'] = 'Selecciona el departamento.';
        }
        if ($prov === '') {
            $this->errors['prov'] = 'Selecciona la provincia.';
        }
        if ($dist === '') {
            $this->errors['dist'] = 'Selecciona el distrito.';
        }
        if ($dep === '' || $prov === '' || $dist === '') {
            return;
        }
        if ($this->ubigeo !== null) {
            if (!isset($this->ubigeo[$dep])) {
                $this->errors['dep'] = 'El departamento no es válido.';
                return;
            }
            if (!isset($this->ubigeo[$dep][$prov])) {
                $this->errors['prov'] = 'La provincia no corresponde al departamento.';
                return;
            }
            if (!in_array($dist, $this->ubigeo[$dep][$prov], true)) {
                $this->errors['dist'] = 'El distrito no corresponde a la provincia.';
                return;
            }
        } elseif (mb_strlen($dep) > self::MAX['department'] || mb_strlen($prov) > self::MAX['province']
            || mb_strlen($dist) > self::MAX['district']) {
            $this->errors['dep'] = 'La ubicación no es válida.';
            return;
        }
        $this->clean['department'] = $dep;
        $this->clean['province'] = $prov;
        $this->clean['district'] = $dist;
    }

    /**
     * Strips control chars and collapses whitespace. No htmlspecialchars here:
     * escaping happens at the output point (HTML e-mail); the PDF takes raw text.
     */
    private function normalize(string $v): string
    {
        $v = str_replace(["\0", "\r"], '', $v);
        $v = preg_replace('/[\x{0000}-\x{0008}\x{000B}\x{000C}\x{000E}-\x{001F}\x{007F}]/u', '', $v) ?? '';
        $v = preg_replace('/[ \t]+/', ' ', $v) ?? '';
        $v = preg_replace('/\n{3,}/', "\n\n", $v) ?? '';
        return trim($v);
    }
}
