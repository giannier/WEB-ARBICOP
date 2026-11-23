# cPanel-like host for the cutover simulation: Apache + mod_php 8.1, running AS the cPanel user (like LiteSpeed lsapi /
# suPHP would), docroot /home/arbicopc/public_html. PHP 8.1 = oldest version the api supports.
FROM php:8.1-apache
RUN apt-get update && apt-get install -y --no-install-recommends git curl ca-certificates && rm -rf /var/lib/apt/lists/* \
 && a2enmod rewrite headers expires deflate alias \
 && useradd -m -u 1000 -s /bin/bash arbicopc && chmod 711 /home/arbicopc \
 && sed -ri 's#/var/www/html#/home/arbicopc/public_html#' /etc/apache2/sites-available/000-default.conf \
 && printf '%s\n' 'ServerName localhost' \
      '<Directory /home/arbicopc/public_html>' '  Options FollowSymLinks' '  AllowOverride All' '  Require all granted' '</Directory>' \
      > /etc/apache2/conf-enabled/cpanel-sim.conf \
 && chown -R arbicopc:arbicopc /var/log/apache2 /var/run/apache2 /var/lock/apache2 2>/dev/null || true
ENV APACHE_RUN_USER=arbicopc APACHE_RUN_GROUP=arbicopc
