#!/bin/bash
# Runs as the cPanel user: executes the tasks of .cpanel.yml from the repo clone, UNMODIFIED, one `bash -c` per task,
# stopping at the first failure (what "Deploy HEAD Commit" does as far as known; the real cPanel run is NOT verified).
REPO=/home/arbicopc/repos/WEB-ARBICOP
cd "$REPO" || exit 90
awk '/^deployment:/{d=1} d && /^[ ]+tasks:/{t=1; next} t && /^[ ]*- /{sub(/^[ ]*- /,""); print}' .cpanel.yml > /tmp/cpanel-tasks.txt
n=0
while IFS= read -r cmd; do
  n=$((n+1)); echo "[task $n] $cmd"
  /bin/bash -c "$cmd"; st=$?
  if [ $st -ne 0 ]; then echo "[task $n] FAILED (exit $st)"; exit $st; fi
done < /tmp/cpanel-tasks.txt
echo "[deploy] $n tasks OK"
