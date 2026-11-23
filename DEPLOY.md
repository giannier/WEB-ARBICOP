# Guía de despliegue en cPanel (ARBICOP)

Resultado final: `arbicop.com` pasa de WordPress/Elementor a un sitio **estático** (carpeta `dist/`) y `/tienda/` **sigue siendo WordPress** (WooCommerce), sin tocarse salvo 3 archivos propios en `tienda/wp-content/mu-plugins/`.

| Dato | Valor |
|---|---|
| Usuario cPanel / docroot | `arbicopc` / `/home/arbicopc/public_html` (dominio principal) |
| Repo en el servidor (fuera del docroot) | `/home/arbicopc/repos/WEB-ARBICOP` |
| Repo remoto (privado) | `giannier/WEB-ARBICOP` en GitHub |
| Respaldos en el servidor | `/home/arbicopc/respaldos/` (se crea si no existe) |
| Respaldo local existente | `D:\TRABAJO\RESPALDOS\arbicop` (2 `.sql` + `arbicop.zip` + `MANIFEST.md` con sha256) |
| Bases de datos | `arbicopc_wp847` (tienda, **sigue en uso**), `arbicopc_504` (WordPress raíz, prefijo `wpfb_`, queda sin uso: **no borrar**) |

> Regla de oro: **nunca borres, mueve**. Todo se puede deshacer (paso 6).
> Qué está verificado y qué no: ver "Límites conocidos". La ejecución real de `.cpanel.yml` en cPanel **no** se pudo comprobar; lo demás se ensayó en un simulacro Docker (`docker/deploy-test/results.md`).

## 0. Requisitos y decisiones previas

1. Acceso a cPanel con **Git Version Control**, **Terminal** (o SSH Access), **File Manager**, **MultiPHP Manager**, **phpMyAdmin** y **Backup**.
2. PHP del dominio: **8.1 a 8.4** (hoy el `.htaccess` raíz fija `ea-php82`). Anota la versión actual en MultiPHP Manager.
3. Confirma que existe `/home/arbicopc/public_html/tienda/wp-content/mu-plugins/` (hoy contiene `wp-toolkit.php`). `.cpanel.yml` **no** crea carpetas: si faltara, el despliegue marca error al copiar los 3 archivos de la tienda (el sitio estático ya estaría copiado).
4. Decisiones ya tomadas (ver también "Imágenes antiguas"):
   - `wp-content/uploads/` del WordPress raíz **se deja en su sitio** (con PHP desactivado) para que las URLs de imágenes antiguas sigan funcionando; el resto del WordPress raíz se mueve.
   - La carpeta `beneficios/` antigua se mueve completa; solo se devuelven sus 2 archivos `google*.html` (verificación de Search Console).
5. Elige una hora de poco tráfico: entre el paso 3 y el paso 4 el sitio queda sin página de inicio por **menos de un minuto**; ejecútalos seguidos.
6. Pausa cambios en la tienda (pedidos de prueba, ediciones) hasta terminar.

## 1. Respaldo en producción (obligatorio, antes de tocar nada)

1. cPanel > **Backup** > *Download a Full Account Backup* (o Backup Wizard) y guárdalo en tu PC. Es la copia de seguridad total.
2. cPanel > **phpMyAdmin** > `arbicopc_wp847` > **Exportar** > Rápido > SQL. Repite con `arbicopc_504`. Guárdalos en tu PC junto al respaldo local existente (`D:\TRABAJO\RESPALDOS\arbicop`).
3. Instantánea de archivos dentro del servidor (copia, no mueve). En cPanel > **Terminal**:

```bash
mkdir -p /home/arbicopc/respaldos
chmod 700 /home/arbicopc/respaldos
FECHA=$(date +%Y%m%d-%H%M)
cd /home/arbicopc
tar -czf respaldos/public_html-$FECHA.tgz public_html     # puede tardar; si falla por espacio, usa solo el Full Backup
ls -lh respaldos/
```

4. Verifica que el `.tgz` abre (`tar -tzf respaldos/public_html-<fecha>.tgz | head`) y que los `.sql` pesan algo razonable.

## 2. Preparar el repositorio, la llave SSH y el clon en cPanel

El repo es **privado**, así que cPanel necesita una *deploy key* SSH de solo lectura.

1. cPanel > **Terminal** (o SSH Access) y crea la llave **sin passphrase** (cPanel no puede pedirla):

```bash
ssh-keygen -t ed25519 -C "cpanel-arbicop-deploy" -f ~/.ssh/arbicop_deploy -N ""
cat ~/.ssh/arbicop_deploy.pub          # copia esta línea (la pública)
chmod 600 ~/.ssh/arbicop_deploy
```

   (Alternativa: cPanel > **SSH Access** > *Generate a New Key* y luego *Manage* > *Authorize*.)
2. GitHub > repo `giannier/WEB-ARBICOP` > **Settings > Deploy keys > Add deploy key**: pega la clave pública, título `cPanel arbicop`, **sin** marcar *Allow write access*.
3. Indica a SSH qué llave usar para GitHub:

```bash
cat >> ~/.ssh/config <<'CFG'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/arbicop_deploy
  IdentitiesOnly yes
CFG
chmod 600 ~/.ssh/config
ssh -T git@github.com                  # acepta la huella (yes); debe saludar con el nombre del repo
```

4. cPanel > **Git™ Version Control** > **Create**:
   - *Clone a Repository*: activado.
   - **Clone URL**: `git@github.com:giannier/WEB-ARBICOP.git`
   - **Repository Path**: `/home/arbicopc/repos/WEB-ARBICOP` (**fuera** del docroot).
   - **Repository Name**: `WEB-ARBICOP`. Rama: `main`.
5. **Create** y espera el clonado. Confirma que `/home/arbicopc/repos/WEB-ARBICOP/dist/` y `.cpanel.yml` existen.

Si el clonado falla por la llave: revisa `~/.ssh/config`, que la deploy key esté en ese repo y que el permiso de `~/.ssh` sea 700.

## 3. CUTOVER: mover (no borrar) el WordPress raíz

Todo va a `/home/arbicopc/respaldos/wp-root-<fecha>/`. Qué se mueve y qué **no**:

| Se mueve | Detalle |
|---|---|
| Núcleo WordPress | `wp-admin/`, `wp-includes/`, `wp-*.php` (incluye `wp-config.php` con credenciales viejas: queda en el respaldo, fuera del docroot) |
| `wp-content/` salvo `uploads/` | plugins, themes, mu-plugins, cache, upgrade, `debug.log`, `index.php` (ver "Imágenes antiguas") |
| Archivos raíz | `index.php`, `xmlrpc.php`, `license.txt`, `readme.html`, `.htaccess` (el nuevo viene de `dist/`) y variantes `.htaccess.bk` / `.htaccess_old` |
| Basura pública | `error_log`, `php_errorlog`, `*.zip`, `*.tgz`, `*.sql` del raíz |
| `beneficios/` antigua | instantánea rota + `index.php` sospechoso (ver "Elementos sospechosos"); la página nueva `/beneficios/` sale de `dist/` |

**NO se mueve**: `tienda/` (su `.htaccess` y su `wp-config.php` propios se quedan), `.well-known/` (SSL/ACME), `cgi-bin/`, `wp-content/uploads/`, `php.ini` / `.user.ini` (los gestiona cPanel), `.atl`, y cualquier otra carpeta que no esté en la tabla (revísala antes con `ls -A`).

Antes de ejecutarlo, en **Git Version Control > Manage > Pull or Deploy** haz **Update from Remote** para que el clon esté al día. Luego, en Terminal:

<!-- sim:cutover -->
```bash
FECHA=$(date +%Y%m%d-%H%M%S)
DOC=/home/arbicopc/public_html
RESPALDO=/home/arbicopc/respaldos/wp-root-$FECHA
mkdir -p "$RESPALDO/wp-content" && chmod 700 /home/arbicopc/respaldos "$RESPALDO"
cd "$DOC" || exit 1
echo "--- antes ---"; ls -A
# a) archivos y carpetas de la raiz
for f in wp-admin wp-includes wp-*.php index.php xmlrpc.php license.txt readme.html \
         .htaccess .htaccess.bk .htaccess_old error_log php_errorlog beneficios \
         *.zip *.tgz *.sql; do
  [ -e "$f" ] && mv -v "$f" "$RESPALDO/"
done
# b) wp-content: todo MENOS uploads/
for f in wp-content/* wp-content/.[!.]*; do
  case "$f" in wp-content/uploads) continue;; esac
  [ -e "$f" ] && mv -v "$f" "$RESPALDO/wp-content/"
done
# c) uploads/ se queda, pero sin ejecutar PHP (copia el .htaccess previo si existia)
if [ -d "$DOC/wp-content/uploads" ]; then
  [ -e "$DOC/wp-content/uploads/.htaccess" ] && cp -a "$DOC/wp-content/uploads/.htaccess" "$RESPALDO/uploads.htaccess.orig"
  cat > "$DOC/wp-content/uploads/.htaccess" <<'HTA'
# Legacy WordPress uploads kept only so old image URLs keep working: never execute scripts here.
<FilesMatch "\.(php[0-9]?|phtml|phar|pl|py|cgi|sh)$">
  Require all denied
</FilesMatch>
Options -Indexes
HTA
fi
echo "--- despues (debe quedar: tienda, .well-known, cgi-bin, wp-content/uploads, php.ini y poco mas) ---"; ls -A
echo "Respaldo en: $RESPALDO"
```

Ahora, **sin demora**, en Git Version Control > **Deploy HEAD Commit** (paso 4).

## 4. Deploy HEAD Commit y configuración del servidor

1. cPanel > **Git Version Control** > *Manage* en `WEB-ARBICOP` > pestaña **Pull or Deploy** > **Deploy HEAD Commit**.
   - Ejecuta `.cpanel.yml`: copia `dist/` al docroot y 3 archivos propios de la tienda a `tienda/wp-content/mu-plugins/` (`arbicop-shared-header.php`, `arbicop-shared-header.css`, `arbicop-shop-cart.php`). Solo `cp`: no borra nada y no toca el resto de `/tienda/`.
   - Si el botón sale deshabilitado: el repo del servidor debe estar limpio (sin cambios locales) y `.cpanel.yml` debe estar commiteado.
   - Una caída del paso 3 al 4 de más de unos minutos significa que debes hacer el rollback (paso 6).
2. Restaura lo que el despliegue pisó o que había en el raíz viejo (verificación de Search Console y bloque de PHP de cPanel):

<!-- sim:postdeploy -->
```bash
DOC=/home/arbicopc/public_html
for d in /home/arbicopc/respaldos/wp-root-*; do RESPALDO="$d"; done   # el mas reciente
# a) archivos de verificacion de Google Search Console de la antigua /beneficios/ (inertes)
for f in "$RESPALDO"/beneficios/google*.html; do
  [ -e "$f" ] && cp -n -v "$f" "$DOC/beneficios/"
done
# b) bloque de PHP que cPanel habia escrito en el .htaccess viejo (el .htaccess nuevo viene de dist/ y no lo trae)
if [ -f "$RESPALDO/.htaccess" ] && ! grep -q 'cPanel-generated handler' "$DOC/.htaccess"; then
  printf '\n' >> "$DOC/.htaccess"
  sed -n '/# php -- BEGIN cPanel-generated handler/,/# php -- END cPanel-generated handler/p' "$RESPALDO/.htaccess" >> "$DOC/.htaccess"
  echo "bloque PHP restaurado"
fi
grep -n 'AddHandler\|cPanel-generated' "$DOC/.htaccess"
```

3. **Atención PHP**: `dist/.htaccess` se copia en **cada** despliegue y sustituye el `.htaccess` del docroot, así que el bloque de PHP del punto 2b se pierde en el siguiente despliegue. Después de **cada** despliegue abre cPanel > **MultiPHP Manager** y comprueba que `arbicop.com` sigue en la versión anotada (si cambió, vuelve a guardarla; cPanel reescribe el bloque) y que `/tienda/` y `/api/token.php` responden. Solución definitiva pendiente de tu decisión: incluir ese bloque en `src/public/.htaccess` (ver "Decisiones a confirmar").
   - **OBLIGATORIO justo después de CADA "Deploy HEAD Commit"** (no es opcional): ejecuta el verificador posterior al despliegue. Comprueba que PHP se ejecuta (`/api/token.php` devuelve JSON, no código fuente), que `/libro-de-reclamaciones/`, `/tienda/` y `/` responden 200, que `/api/config.php` y `/api/storage/` dan 403 y muestra la versión de PHP si el servidor la expone. Sale con código distinto de 0 si algo falla.
   - En cPanel > **Terminal**: `cd ~/repos/WEB-ARBICOP && sh tools/post-deploy-check.sh https://arbicop.com`. Desde tu PC (Git Bash o WSL, solo necesita `curl`): `sh tools/post-deploy-check.sh https://arbicop.com`.
   - Si algún control sale `FAIL`: abre MultiPHP Manager (ver arriba), vuelve a guardar la versión de PHP, repite el verificador; si sigue fallando, rollback (paso 6). El verificador no reemplaza la revisión de MultiPHP Manager: la línea `MultiPHP check needed` del final te lo recuerda, y si el servidor no expone `X-Powered-By` no puede mostrarte la versión.
4. **Secretos del libro de reclamaciones** (`api/config.secret.php`), solo la primera vez:
   - cPanel > **Email Accounts** > crea `reclamaciones@arbicop.com` (contraseña larga) y en *Connect Devices* confirma el servidor SMTP de salida (SSL, 465). El código asume `mail.arbicop.com`; si es otro, se cambia `smtp.host` en `src/public/api/config.php` y se vuelve a desplegar. Si el certificado no coincide con el host, el envío falla (ver log en el paso 5).
   - cPanel > **File Manager** > `public_html/api/` : copia `config.secret.example.php` como `config.secret.php` y edítalo: `smtp_password` = contraseña de ese correo; `mail_dry_run` debe quedar en `false`; hCaptcha es opcional (vacío).
   - Permisos: `config.secret.php` **640**; `api/storage/` y subcarpetas **750/755** (escribibles por PHP).
   - Ese archivo **nunca** va al repo y `cp -R dist/.` **no lo toca** (ni `api/storage/`) en despliegues futuros.
5. Revisa `/home/arbicopc/repos/WEB-ARBICOP/src/public/api/config.php`: los datos marcados `TODO` (sufijo de la razón social, host SMTP, redacción legal de los 15 días hábiles) deben estar confirmados antes de dar el sitio por bueno.

## 5. Smoke test (checklist, ventana privada)

- [ ] MultiPHP Manager: la versión de `arbicop.com` es la anotada en el paso 0 (8.1 a 8.4).
- [ ] `/`, `/nosotros/`, `/peritaje/`, `/arbitraje/`, `/conciliacion/`, `/tasacion/`, `/corretaje/`, `/beneficios/`, `/contacto/`: cargan con estilos, imágenes y menú; el menú, el pie y los enlaces sociales (Facebook, Instagram, TikTok, YouTube) abren a donde deben.
- [ ] Formulario de contacto / botón de WhatsApp: abre WhatsApp con el mensaje y el número +51 943 704 298.
- [ ] `/tienda/` carga (cabecera igual a la del sitio); un producto abre; **añadir al carrito** funciona y el icono del carrito de la cabecera actualiza el contador; `/tienda/cart/` y `/tienda/checkout/` cargan; `/tienda/wp-admin/` entra.
- [ ] Pago real de la tienda (izipay/pasarela): no se probó en el simulacro. Haz una compra de prueba en modo de prueba de la pasarela y vuelve a modo producción al terminar.
- [ ] `/libro-de-reclamaciones/`: envía un **reclamo de prueba** (consumidor con tu propio correo). Deben llegar DOS correos con el PDF (uno a `reclamaciones@`, otro al correo ingresado) y el panel debe ofrecer la descarga del PDF; descárgalo. Si no llega el de la empresa queda un marcador en `api/storage/pendientes/`; revisa `api/storage/log/claims.log` y host/contraseña SMTP.
- [ ] `/libro-de-reclamaciones-2/` redirige (301) a `/libro-de-reclamaciones/`.
- [ ] `http://arbicop.com/` redirige a `https://` (y `http://www.` también, si aplica); sin avisos de certificado.
- [ ] `/loquesea/` muestra la página 404 del sitio.
- [ ] `/robots.txt` y `/sitemap.xml` responden y tienen las URLs `https://arbicop.com/...`.
- [ ] 403 esperados: `/api/config.php`, `/api/config.secret.php`, `/api/storage/`, `/api/src/`, `/api/lib/`.
- [ ] 404 esperados (WordPress raíz retirado): `/wp-login.php`, `/wp-admin/`, `/xmlrpc.php`, `/error_log`.
- [ ] `/.well-known/` intacto (el certificado SSL se renueva solo; revisa AutoSSL en cPanel > SSL/TLS Status).
- [ ] Una imagen antigua `/wp-content/uploads/...` (del respaldo, por ejemplo el logo) sigue abriendo.
- [ ] Search Console: envía de nuevo `https://arbicop.com/sitemap.xml`, elimina sitemaps viejos de WordPress (`wp-sitemap.xml`, `sitemap_index.xml`) y revisa el informe de Páginas a los 2-7 días (picos de 404). Confirma que la propiedad sigue verificada.
- [ ] Revisa `error_log` del dominio en cPanel (Metrics > Errors) tras las pruebas.

## 6. ROLLBACK (volver al WordPress anterior)

> **ATENCIÓN: `api/storage/` contiene los reclamos (PDF/JSON) y el correlativo `counter.dat`: son registros legales que se conservan 2 años (D.S. 011-2011-PCM). NUNCA los muevas, borres ni sobrescribas, y nunca borres `counter.dat`. Tampoco muevas `api/config.secret.php`.** La base `arbicopc_504` nunca se toca.

El bloque: copia el estado de la API (`cp`, no mueve), mueve a `respaldos/static-<fecha>/` lo que puso el sitio estático (según `dist/`), deja `api/storage` y `api/config.secret.php` en su sitio y devuelve el WordPress viejo. Si algún nombre ya existe en el docroot no lo pisa: lo avisa y lo deja en el respaldo.

<!-- sim:rollback -->
```bash
FECHA=$(date +%Y%m%d-%H%M%S)
DOC=/home/arbicopc/public_html
DIST=/home/arbicopc/repos/WEB-ARBICOP/dist
RESPALDO=
for d in /home/arbicopc/respaldos/wp-root-*; do [ -d "$d" ] && RESPALDO="$d"; done   # el mas reciente
if [ -z "$RESPALDO" ]; then
  echo "No hay respaldo wp-root-*: usa el Full Backup del paso 1"
else
  ESTADO=/home/arbicopc/respaldos/api-state-$FECHA
  STATIC=/home/arbicopc/respaldos/static-$FECHA
  mkdir -p "$ESTADO" "$STATIC/api" && chmod 700 "$ESTADO" "$STATIC"
  # 0) copia extra del estado (no mueve)
  [ -d "$DOC/api/storage" ] && cp -a "$DOC/api/storage" "$ESTADO/"
  [ -f "$DOC/api/config.secret.php" ] && cp -a "$DOC/api/config.secret.php" "$ESTADO/"
  # 1) fuera lo que puso el sitio estatico en la raiz (misma lista que dist/, salvo api/)
  for f in "$DIST"/* "$DIST"/.[!.]*; do
    n=$(basename "$f")
    [ "$n" = api ] && continue
    [ -e "$DOC/$n" ] && mv -v "$DOC/$n" "$STATIC/"
  done
  # 1b) de api/ solo el codigo; storage/ y config.secret.php se quedan donde estan
  for f in "$DOC"/api/* "$DOC"/api/.[!.]*; do
    n=$(basename "$f")
    case "$n" in storage|config.secret.php) continue;; esac
    [ -e "$f" ] && mv -v "$f" "$STATIC/api/"
  done
  # 2) devuelve el WordPress viejo (incluido su .htaccess); wp-content se fusiona con uploads/
  for f in "$RESPALDO"/* "$RESPALDO"/.[!.]*; do
    n=$(basename "$f")
    [ -e "$f" ] || continue
    case "$n" in
      wp-content)
        for g in "$f"/* "$f"/.[!.]*; do
          [ -e "$g" ] && mv -v "$g" "$DOC/wp-content/"
        done ;;
      uploads.htaccess.orig)
        [ -e "$DOC/wp-content/uploads" ] && mv -v "$f" "$DOC/wp-content/uploads/.htaccess" ;;
      *)
        if [ -e "$DOC/$n" ]; then echo "CONFLICTO: $n ya existe en el docroot; se deja en $RESPALDO"; else mv -v "$f" "$DOC/"; fi ;;
    esac
  done
  echo "--- docroot ahora ---"; ls -A "$DOC"
fi
```

Verifica `/` (WordPress), `/tienda/`, y que `api/storage/` y `api/config.secret.php` siguen en su sitio (el WordPress viejo no los usa). Si había un `wp-content/uploads/.htaccess` propio, se restaura; el que puso el paso 3 se sustituye. Los 3 archivos de `tienda/wp-content/mu-plugins/` quedan (son inofensivos); si quieres devolver la tienda a su estado original muévelos como en la rama siguiente.

Para volver a poner el sitio estático después: repite 3 y 4 (el correlativo y los reclamos continúan porque `storage/` no se movió). Si por error se movieron, restáuralos desde `respaldos/api-state-<fecha>/` **antes** de recibir nuevos reclamos.

### Rama: "la tienda se rompió"

Síntomas: `/tienda/` da error 500, pantalla en blanco, cabecera rota o el carrito no actualiza tras el despliegue.

1. Mira `public_html/tienda/php_errorlog` y el `error_log` del dominio (cPanel > Errors).
2. Comprueba la versión de PHP (MultiPHP Manager): si el despliegue quitó el bloque de PHP y cambió la versión, vuelve a guardarla (paso 4.3).
3. Si el error nombra uno de los 3 archivos propios, apártalos (se mueven, no se borran) y recarga `/tienda/`:

<!-- sim:shopfix -->
```bash
MU=/home/arbicopc/public_html/tienda/wp-content/mu-plugins
DEST=/home/arbicopc/respaldos/mu-plugins-apartados-$(date +%Y%m%d-%H%M%S)
mkdir -p "$DEST"
for f in arbicop-shared-header.php arbicop-shared-header.css arbicop-shop-cart.php; do
  [ -e "$MU/$f" ] && mv -v "$MU/$f" "$DEST/"
done
```

4. Si sigue roto y no es por esos archivos, el sitio estático no lo causó: restaura `arbicopc_wp847` y los archivos de `tienda/` desde el paso 1, o haz el rollback completo.

## Mantenimiento habitual

1. Edita `src/`, ejecuta `npm run build` y `npm run check`.
2. Commit **incluyendo `dist/`** (cPanel no ejecuta npm), push a GitHub.
3. cPanel > Git Version Control > *Update from Remote* > *Deploy HEAD Commit*; luego **ejecuta obligatoriamente** `sh tools/post-deploy-check.sh https://arbicop.com` (paso 4.3), repite el control de MultiPHP Manager y mira rápido `/` y `/tienda/`.
4. Cambios en `src/public/api/config.php` también se despliegan así. Los secretos solo viven en `api/config.secret.php` (servidor).
5. Revisa los reclamos pendientes de envío (sección "Revisión de pendientes"): semanal y tras cualquier cambio de SMTP.

## Revisión de pendientes (Libro de Reclamaciones)

Cada reclamo se archiva **antes** de enviar los correos. Si falla el correo a la empresa (`reclamaciones@arbicop.com`) o el del consumidor (SMTP caído, contraseña cambiada, buzón lleno), el reclamo sigue registrado y queda un archivo marcador en `public_html/api/storage/pendientes/<número>.json` más una línea `PENDING` en `api/storage/log/claims.log`. Nadie recibe un aviso automático: hay que revisarlo.

**Cuándo:** una vez por semana, y siempre después de cambiar algo del SMTP (contraseña del buzón, host, puerto) o de un despliegue que toque `api/`. Por ley (Ley 29571) la respuesta al consumidor vence en 15 días hábiles: un pendiente olvidado es un incumplimiento.

En cPanel > **Terminal** (usa el mismo PHP del dominio; si `php -v` no muestra 8.1 a 8.4, usa `ea-php82` en su lugar):

```bash
cd ~/public_html
ls api/storage/pendientes/ 2>/dev/null | wc -l      # cuántos marcadores hay (0 = todo entregado)
php api/tools/pendientes.php                         # lista: número, fecha y qué mensaje falta (empresa/consumidor)
php api/tools/pendientes.php --resend LR-2026-0001   # reenvía lo que falta desde el PDF archivado
```

- `--resend` usa la configuración vigente (`config.secret.php`), actualiza el estado en el JSON archivado y borra el marcador solo si el envío tuvo éxito. Si vuelve a fallar, el marcador sigue y el motivo (clase del error) queda en `claims.log`: corrige el SMTP y repite.
- Si el consumidor no recibió su copia y el reenvío no es posible, escríbele tú desde `reclamaciones@arbicop.com`: su correo está en `api/storage/hojas/AAAA/<número>.json`. No borres nunca esos archivos ni `api/storage/counter.dat`.
- El sitio ya le indica al consumidor (cuando falla el correo de la empresa) que su reclamo quedó registrado y que puede escribir a `comercial@arbicop.com` o al WhatsApp +51 943 704 298.
- La herramienta solo funciona por terminal: `api/tools/` está bloqueado por `.htaccess` (la URL responde 403) y el script se niega a ejecutarse por web.

## Imágenes antiguas (`/wp-content/uploads/...`)

Google Imágenes, redes sociales y enlaces externos pueden apuntar a `https://arbicop.com/wp-content/uploads/AAAA/MM/archivo.ext`. No se puede saber cuántas están referenciadas desde fuera. Decisión: **dejar `wp-content/uploads/` en su sitio** (el cutover solo mueve el resto de `wp-content/`) con ejecución de PHP denegada. Es lo más barato y seguro: no hay reglas 301 que mantener ni imágenes que se rompan, y el sitio nuevo no depende de esa carpeta (usa `dist/assets/`). Alternativa descartada: 301 solo para logo/og porque el sitio nuevo usa nombres distintos y sería adivinar. Revisión sugerida a los 6 meses: si Search Console y el log de accesos no muestran tráfico a `/wp-content/uploads/`, muévela a `respaldos/` también. Aviso: busca archivos `.php` dentro (`find /home/arbicopc/public_html/wp-content/uploads -name '*.php'`); no deberían existir (suelen ser malware).

URLs de páginas antiguas sin equivalente darán 404 (por ejemplo páginas WooCommerce del raíz `/shop/`, `/cart/`, `/my-account/`, si existían, y entradas de blog). Si Search Console las muestra indexadas, agrega 301 en `src/public/.htaccess` (`RewriteRule ^viejo/?$ /nuevo/ [R=301,L]`), `npm run build`, commit y despliega. `/libro-de-reclamaciones-2/` ya está cubierta.

## Límites conocidos

- **La ejecución real de `.cpanel.yml` en cPanel no está verificada.** Se desconoce con certeza el directorio de trabajo, el shell y si cPanel exige un árbol de trabajo limpio en tu versión. Por eso todos los comandos usan rutas absolutas. El simulacro ejecuta esos mismos comandos sin modificar, como usuario no root, pero no es cPanel.
- Servidor web: el simulacro usa Apache 2.4 + mod_php 8.1; producción parece **LiteSpeed** (el `.htaccess` viejo traía bloques LSCACHE). Reglas, cabeceras y `RedirectMatch` son compatibles en teoría; compruébalo con el smoke test (sobre todo 403 de `/api/*`, redirección HTTPS y 404 propio). La versión de PHP real se controla con el bloque del paso 4.
- SMTP real (host, certificado, entrega a bandeja) **no** probado: el simulacro usa modo dry-run.
- Pasarela de pago izipay en vivo y flujo completo de compra: **no** probados.
- El clon SSH real desde GitHub no se pudo ensayar (en el simulacro el repo se arma con `git init` + `git clone` local).
- El cumplimiento de permisos reales de cPanel (suEXEC/CageFS) no se reprodujo; el simulacro corre Apache como el usuario `arbicopc` para aproximarlo.

## Decisiones a confirmar

1. **Bloque de PHP en `.htaccess`**: cada despliegue lo pierde. Opción recomendada: añadir al final de `src/public/.htaccess` el bloque `# php -- BEGIN cPanel-generated handler ... AddHandler application/x-httpd-ea-php82 .php .php8 .phtml ... END` (se vería en el `.htaccess` actual de producción), reconstruir `dist/`. Riesgo: si el paquete `ea-php82` desapareciera, los `.php` fallarían (la API y la tienda). No se añadió sin tu visto bueno.
2. Dejar `wp-content/uploads/` en su sitio (arriba) y devolver los 2 `google*.html` de `beneficios/`.
3. `.cpanel.yml` sin `mkdir`: falla de forma visible si no existe `tienda/wp-content/mu-plugins/`.

## Seguimiento de seguridad

- **Rotar el token de WP Toolkit** que se expuso antes (cPanel > WP Toolkit: regenerar/revocar tokens y claves de API; está implicado `tienda/wp-content/mu-plugins/wp-toolkit/`). Cámbialo aunque creas que no se usó.
- **Revisar `beneficios/index.php` antiguo**: sirve contenido distinto a bots de buscadores/redes (lee `/home/arbicopc/mail/index.html` para Googlebot, Bingbot, facebookexternalhit, etc.). Es un comportamiento de *cloaking*, típico de sitios comprometidos o de SEO spam. Tras el cutover queda en `respaldos/` (no accesible por web). Revisa quién lo creó, el contenido de `/home/arbicopc/mail/index.html`, y busca más archivos parecidos en `tienda/` y `wp-content/` (`grep -rl "is_bot\|Googlebot" /home/arbicopc/public_html /home/arbicopc/respaldos`). Considera un escaneo de malware (cPanel/Imunify) y cambiar las contraseñas de cPanel/FTP/WordPress.
- **Credenciales del `wp-config.php` raíz** (usuario/clave de `arbicopc_504`, salts): rotarlas tras el cutover (cambiar la contraseña del usuario MySQL; la base queda sin uso, sin borrarla). `wp-config.php` queda en `respaldos/wp-root-<fecha>/` (permisos 700 en la carpeta).
- **Cuentas admin del WordPress raíz muerto**: eliminarlas más adelante en `wpfb_users` de `arbicopc_504` (con respaldo antes), o dejar el WordPress sin usar sin acceso.
- **Archivos públicos en `/tienda/`** (no se tocan en este cambio; revisa con `curl -I`): `php_errorlog`, `php.ini`, `wp-config-docker.php`, `.htaccess.bk`, `.htaccess_old`, `woocommerce-es_ES.zip`. El `.htaccess` nuevo bloquea los que empiezan con punto, pero `php_errorlog` (sin extensión) y el `.zip` se pueden servir.
- `error_log` del raíz es público hoy (92 KB aprox.); el cutover lo mueve.

## Elementos sospechosos (lista)

1. `public_html/beneficios/index.php`: cloaking hacia `/home/arbicopc/mail/index.html` (arriba).
2. `/home/arbicopc/mail/index.html`: contenido desconocido servido a bots; revisarlo.
3. `public_html/beneficios/index-old.php`: instantánea con URLs absolutas de `arbicop.com` y `post-27.css` que da 404.
4. `tienda/php_errorlog`, `tienda/wp-config-docker.php`, `tienda/.htaccess.bk`, `tienda/.htaccess_old`, `tienda/woocommerce-es_ES.zip`: sobrantes públicos.
5. `public_html/error_log` en el raíz (92 KB).
6. Token de WP Toolkit expuesto anteriormente.
7. `.atl`: aparece en el listado del docroot de producción; inspecciónalo antes de decidir (no se toca).
