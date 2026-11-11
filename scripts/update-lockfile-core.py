#!/usr/bin/env python3
"""Thêm importer `backend/core-api` vào pnpm-lock.yaml.

Gộp dependency của 6 service NestJS (core-api chứa code của tất cả), lấy
version đã resolve từ các importer hiện có.
"""
import re
import sys

LOCK = 'pnpm-lock.yaml'
SERVICES = [
    'backend/customer-api',
    'backend/iam-service',
    'backend/inventory-service',
    'backend/logistics-service',
    'backend/notification-service',
    'backend/order-service',
]
TARGET = 'backend/core-api'
HEADER = "importers:\n"


def split_blocks(lines):
    """Trả về {importer: (start, end)} trong phần `importers:`."""
    start = lines.index('importers:\n') + 1
    blocks = {}
    i = start
    while i < len(lines):
        line = lines[i]
        m = re.match(r'^  ([^\s:]+):\s*$', line)
        if m:
            name = m.group(1)
            j = i + 1
            while j < len(lines) and not re.match(r'^  [^\s:]+:\s*$', lines[j]):
                j += 1
            blocks[name] = (i, j)
            i = j
        else:
            i += 1
    return blocks


def parse_block(lines, start, end):
    """Trả về {section: {name: (specifier, version)}}."""
    out = {}
    section = None
    name = None
    spec = None
    for line in lines[start:end]:
        m_sec = re.match(r'^    (\w+):\s*$', line)
        if m_sec:
            section = m_sec.group(1)
            out.setdefault(section, {})
            name = None
            continue
        m_name = re.match(r"^      '?([^':]+)'?:\s*$", line)
        if m_name and section:
            name = m_name.group(1)
            spec = None
            out[section].setdefault(name, [None, None])
            continue
        m_spec = re.match(r'^        specifier: (.*)$', line)
        if m_spec and name:
            out[section][name][0] = m_spec.group(1)
            continue
        m_ver = re.match(r'^        version: (.*)$', line)
        if m_ver and name:
            out[section][name][1] = m_ver.group(1)
    return out


def render(name, data):
    lines = [f'  {name}:\n']
    for section in ('dependencies', 'devDependencies'):
        if section not in data:
            continue
        lines.append(f'    {section}:\n')
        for dep in sorted(data[section]):
            spec, version = data[section][dep]
            if spec is None or version is None:
                raise SystemExit(f'incomplete entry for {dep} in {section}')
            quoted = f"'{dep}'" if dep.startswith('@') or ':' in dep else dep
            lines.append(f'      {quoted}:\n')
            lines.append(f'        specifier: {spec}\n')
            lines.append(f'        version: {version}\n')
    return lines


def main() -> int:
    with open(LOCK, encoding='utf-8') as fh:
        lines = fh.readlines()

    blocks = split_blocks(lines)
    merged = {'dependencies': {}, 'devDependencies': {}}
    for svc in SERVICES:
        if svc not in blocks:
            raise SystemExit(f'importer not found: {svc}')
        start, end = blocks[svc]
        data = parse_block(lines, start, end)
        for section in merged:
            for dep, value in data.get(section, {}).items():
                merged[section].setdefault(dep, value)

    # Dependency chỉ có ở package gốc (ví dụ helmet) vẫn phải có trong
    # importer của core-api, nếu không `pnpm install --frozen-lockfile` sẽ fail.
    import json
    with open('backend/core-api/package.json', encoding='utf-8') as fh:
        pkg = json.load(fh)
    wanted = {**pkg.get('dependencies', {}), **pkg.get('devDependencies', {})}
    for dep in wanted:
        if dep in merged['dependencies'] or dep in merged['devDependencies']:
            continue
        for name, (start, end) in blocks.items():
            data = parse_block(lines, start, end)
            for section in merged:
                if dep in data.get(section, {}):
                    merged[section][dep] = data[section][dep]
                    break
            if dep in merged['dependencies'] or dep in merged['devDependencies']:
                break
        else:
            raise SystemExit(f'cannot resolve version for dependency {dep}')

    if TARGET in blocks:
        start, end = blocks[TARGET]
        lines[start:end] = render(TARGET, merged)
    else:
        insert_at = blocks[SERVICES[0]][0]
        lines[insert_at:insert_at] = render(TARGET, merged)

    with open(LOCK, 'w', encoding='utf-8') as fh:
        fh.writelines(lines)
    print(f'wrote importer {TARGET} '
          f'({len(merged["dependencies"])} deps, {len(merged["devDependencies"])} dev deps)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
