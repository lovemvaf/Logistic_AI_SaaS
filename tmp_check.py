#!/usr/bin/env python3
"""Static verification of backend/rust-api route declarations.

Checks (mirroring matchit's radix tree rules):
  * duplicate path strings across files
  * two param children (`:a`, `:b`) under the same parent
  * a param child and a catch-all child under the same parent
  * two catch-all children under the same parent
  * frontend contract coverage (every repository.ts call must be declared)
"""
import re
import sys

ROOT = "/home/ngoctan/Downloads/Logistic_AI"
API_SRC = f"{ROOT}/backend/rust-api/crates/api/src"

files = [
    "orders", "inventory", "wms", "logistics", "finance",
    "tenant", "admin", "reports", "dashboard", "health", "auth",
    "meta", "ai",
]


def load():
    decls = []
    for name in files:
        src = open(f"{API_SRC}/routes/{name}.rs").read()
        for m in re.finditer(r'\.route\(\s*"((?:[^"\\]|\\.)*)"', src):
            raw = m.group(0)
            p = m.group(1)
            rest = src[m.end():]
            fam = re.search(r"([a-z_]+)\(", rest)
            fam = fam.group(1) if fam else "?"
            decls.append((name, p, fam))
    return decls


def check_tree(decls):
    """Build a radix-style tree; report structurally impossible placements."""
    errors = []
    root = {"static": {}, "param": None, "catchall": None}

    def insert(node, parts, idx, name, path):
        if idx >= len(parts):
            return
        seg = parts[idx]
        is_param = seg.startswith(":")
        is_catchall = seg.startswith("*")
        parent = "/".join(parts[:idx])

        if is_param:
            if node["param"]:
                if node["param"]["key"] != seg[1:]:
                    errors.append(
                        f"param siblings under /{parent}\n"
                        f"    {name}|{path} vs {node['param']['name']}|{node['param']['path']}")
            else:
                node["param"] = {"static": {}, "param": None, "catchall": None,
                                 "key": seg[1:], "name": name, "path": path}
            insert(node["param"], parts, idx + 1, name, path)
        elif is_catchall:
            if node["param"] or node["catchall"]:
                opener = node["param"] or node["catchall"]
                errors.append(
                    f"wildcard sibling under /{parent}\n"
                    f"    {name}|{path} vs {opener['name']}|{opener['path']}")
            else:
                node["catchall"] = {"key": seg[1:], "name": name, "path": path}
            insert(node["catchall"], parts, idx + 1, name, path)
        else:
            if seg not in node["static"]:
                node["static"][seg] = {"static": {}, "param": None, "catchall": None,
                                       "name": name, "path": path}
            insert(node["static"][seg], parts, idx + 1, name, path)

    for name, path, fam in decls:
        insert(root, path.split("/"), 0, name, path)
    return errors


def frontend_calls(path):
    src = open(path).read()
    calls = []
    # crud(request, '/P') -> GET/POST/PATCH/DELETE
    for m in re.finditer(r"crud\(request,\s*'([^']+?)'\)", src):
        p = m.group(1)
        for meth in ("GET", "POST", "PATCH", "DELETE"):
            calls.append((meth, p))
    # explicit request calls
    for m in re.finditer(r"request\('([A-Z]+)',\s*'([^']+?)'\)", src):
        calls.append((m.group(1), m.group(2)))
    return sorted(set(calls))


def norm(path):
    """Normalize param names: each ':name' segment -> ':id'."""
    return "/".join((":" if p == "" else (p if not p.startswith(":") else ":id"))
                    for p in path.split("/"))


def main():
    decls = load()
    errors = check_tree(decls)
    print("=== static tree errors ===")
    if errors:
        print(" ", errors[0] if len(errors) == 1 else "")
        for e in errors:
            print(f"  {e}")
    else:
        print("  (none)")
    print()

    print("=== duplicate path strings ===")
    paths = {}
    for name, path, fam in decls:
        paths.setdefault(path, []).append(name)
    dupes = {p: v for p, v in paths.items() if len(v) > 1}
    for p, v in dupes.items():
        print(f"  DUPLICATE {p}: {', '.join(v)}")
    if not dupes:
        print("  (none)")
    print()

    print("=== declared routes (group | path) ===")
    for name, path, fam in sorted(decls, key=lambda d: (d[0], d[1])):
        print(f"  {name:10s} {path}")
    print()

    print("=== frontend contract vs declared ===")
    calls = frontend_calls(
        f"{ROOT}/frontend/reporting/tenant-portal/src/lib/mock/repository.ts")
    method_any = {"GET", "POST", "PATCH", "DELETE"}

    def expand(p):
        """family -> set of HTTP methods the declared route supports."""
        p = p.upper()
        return method_any if p == "ANY" else {p}

    declared_keys = {
        f"{meth} {norm(path)}"
        for name, path, fam in decls
        for meth in expand(fam)
    }
    req_norms = {f"{meth} {norm(path)}" for meth, path in calls}
    missing = sorted(req_norms - declared_keys)
    extra = sorted(declared_keys - req_norms)

    print(f"  frontend combos: {len(req_norms)}")
    print(f"  declared combos: {len(declared_keys)}")
    print(f"  missing (declared < frontend): {len(missing)}")
    for m in missing:
        print(f"    - {m}")
    print(f"  extra (declared, not frontend): {len(extra)}")
    for e in extra:
        print(f"    + {e}")
    print()

    print(f"=== SUMMARY: errors={len(errors)} duplicates={len(dupes)} "
          f"missing={len(missing)} extra={len(extra)} ===")
    return 1 if (errors or missing) else 0


if __name__ == "__main__":
    sys.exit(main())
