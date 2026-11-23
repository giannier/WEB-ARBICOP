# Production-like Apache + mod_php for the Libro de Reclamaciones end-to-end test.
# PHP_VERSION build arg: 8.1 (oldest supported) and 8.4 (newest) are both exercised.
ARG PHP_VERSION=8.4
FROM php:${PHP_VERSION}-apache
RUN a2enmod rewrite headers expires deflate alias \
 && sed -ri "s#AllowOverride None#AllowOverride All#" /etc/apache2/apache2.conf \
 && echo "ServerName localhost" > /etc/apache2/conf-enabled/servername.conf
COPY entrypoint.sh /usr/local/bin/libro-entrypoint.sh
RUN chmod +x /usr/local/bin/libro-entrypoint.sh
ENTRYPOINT ["libro-entrypoint.sh"]
