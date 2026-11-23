#!/bin/sh
# Named volumes mount as root: hand storage/ to Apache before starting (cPanel gives PHP its own user).
chown -R www-data:www-data /var/www/html/api/storage 2>/dev/null
exec apache2-foreground
