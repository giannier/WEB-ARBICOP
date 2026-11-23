#!/bin/bash
# Runs as the cPanel user: extracts the fenced bash block that follows `<!-- sim:NAME -->` in the DEPLOY.md of the repo
# clone and executes it literally.
set -u
cd /home/arbicopc/repos/WEB-ARBICOP || exit 90
FENCE='```'
awk -v m="<!-- sim:$1 -->" -v fence="$FENCE" '$0==m{f=1;next} f&&index($0,fence"bash")==1{b=1;next} f&&b&&index($0,fence)==1{exit} f&&b{print}' DEPLOY.md > "/tmp/block-$1.sh"
[ -s "/tmp/block-$1.sh" ] || { echo "block $1 not found in DEPLOY.md"; exit 91; }
exec /bin/bash "/tmp/block-$1.sh"
