#!/usr/bin/env python3
"""Static check of .cpanel.yml (needs PyYAML). Run from anywhere: python tools/check-cpanel-yml.py

- the file parses and has deployment.tasks (list of strings)
- every task is `/bin/cp [-R|-f] <src> <dest>` with absolute paths and no shell variables/operators
- every source exists in this repo layout (server repo path is mapped to the local project root)
- every destination is inside the docroot; inside /tienda only the mu-plugins directory is allowed
"""
import re, shlex, sys
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parent.parent
REPO = "/home/arbicopc/repos/WEB-ARBICOP"
DOCROOT = "/home/arbicopc/public_html"
fails = []

def check(ok, msg):
    print(("PASS  " if ok else "FAIL  ") + msg)
    if not ok:
        fails.append(msg)

doc = yaml.safe_load((ROOT / ".cpanel.yml").read_text(encoding="utf-8"))
tasks = (doc or {}).get("deployment", {}).get("tasks")
check(isinstance(tasks, list) and tasks and all(isinstance(t, str) for t in tasks), "YAML parses: deployment.tasks is a non-empty list of strings")
for t in tasks:
    parts = shlex.split(t)
    check(parts[0] == "/bin/cp", f"only /bin/cp: {t[:70]}")
    check(not re.search(r"[$;&|`<>]", t), "no shell variables/operators")
    flags = [p for p in parts[1:] if p.startswith("-")]
    check(set(flags) <= {"-R", "-f", "-a"}, f"flags allowed (-R/-f/-a): {flags}")
    args = [p for p in parts[1:] if not p.startswith("-")]
    check(len(args) == 2, "exactly one source and one destination")
    src, dst = args
    check(src.startswith(REPO + "/") and dst.startswith(DOCROOT + "/"), "absolute src under repo, dst under docroot")
    local = ROOT / src[len(REPO) + 1:]
    check(local.exists(), f"source exists locally: {src[len(REPO)+1:]}")
    if dst.startswith(DOCROOT + "/tienda"):
        check(dst.startswith(DOCROOT + "/tienda/wp-content/mu-plugins/"), "inside /tienda only mu-plugins is written")
    check(".." not in dst and ".." not in src, "no path traversal")
    if (ROOT / "dist" / "api" / "config.secret.php").exists():
        check(False, "dist/ must not ship config.secret.php")

print(f"\n{len(tasks)} tasks, {len(fails)} failures")
sys.exit(1 if fails else 0)
