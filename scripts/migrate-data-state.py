#!/usr/bin/env python3
"""Migrate trang legacy sang pattern 4 state dùng chung (DataState / TableState).

Script quét các trang có đúng shape:

    {loading ? ( <LOAD/> ) : X.length === 0 ? ( <EMPTY/> ) : ( <DATA/> ) }

và đổi thành:

    <DataState loading={loading} empty={!loading && X.length === 0} emptyContent={<EMPTY/>}>
      <DATA/>
    </DataState>

Bản table-row (`<tr>`) thì dùng `<TableState>`.

Script KHÔNG tự ý thêm/xoá UI: phần empty cũ được giữ nguyên qua `emptyContent`.
"""
import os
import re
import sys

PORTALS = [
    'frontend/feature-test/admin-portal',
    'frontend/reporting/tenant-portal',
    'frontend/reporting/customer-portal',
    'frontend/reporting/pack-station-web',
]


def match_paren(s: str, start: int) -> int:
    """Trả về index của dấu `)` khớp với `(` tại `start` (bỏ qua string/template)."""
    depth = 0
    i = start
    while i < len(s):
        ch = s[i]
        if ch in '"\'`':
            quote = ch
            i += 1
            while i < len(s):
                if s[i] == '\\':
                    i += 2
                    continue
                if s[i] == quote:
                    break
                i += 1
        elif ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise ValueError('không khớp ngoặc')


def find_block(s: str, marker: str) -> int:
    """Index của `(` ngay sau marker (ví dụ `) : X.length === 0 ? (`)."""
    idx = s.find(marker)
    if idx < 0:
        return -1
    op = s.find('(', idx)
    return op



def detect_error_var(src: str) -> bool:
    """Trang có state lỗi không (tên biến khác `error` thì bỏ qua)."""
    return bool(re.search(r'\b(?:const|let)\s*\[\s*error\b', src) or
                re.search(r'\b(?:const|let)\s+error\b\s*[:=]', src))


def detect_retry_fn(src: str):
    """Tên hàm nạp lại dữ liệu, khai báo ở cấp component (indent <= 4).

    Hàm khai báo bên trong useEffect không dùng được làm `onRetry` vì nằm ngoài
    phạm vi component.
    """
    for line in src.split('\n'):
        indent = len(line) - len(line.lstrip())
        if indent > 2:
            continue
        m = re.search(r'\b(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(', line)
        if not m:
            m = re.search(r'\b(?:async\s+)?function\s+(\w+)\s*\(', line)
        if not m:
            continue
        name = m.group(1)
        if name.lower() in ('fetch', 'window.fetch', 'globalThis.fetch'):
            continue
        if re.search(r'fetch|load|refresh|reload', name, re.I):
            return name
    return None


def migrate(content: str):
    """Trả về (content mới, số block đã migrate)."""
    count = 0
    changed = True
    while changed:
        changed = False
        for m in re.finditer(r'\{loading \? \(', content):
            open_paren = m.end() - 1
            try:
                close_load = match_paren(content, open_paren)
            except ValueError:
                continue
            rest = content[close_load + 1:]
            em = re.match(r'\s*:\s*([A-Za-z_][\w\.]*)\.length === 0 \? \(', rest)
            if not em:
                continue
            empty_open = close_load + 1 + em.end() - 1
            try:
                close_empty = match_paren(content, empty_open)
            except ValueError:
                continue
            rest2 = content[close_empty + 1:]
            dm = re.match(r'\s*:\s*\(', rest2)
            if dm:
                data_open = close_empty + 1 + dm.end() - 1
                try:
                    close_data = match_paren(content, data_open)
                except ValueError:
                    continue
                data_expr = content[data_open + 1:close_data]
            else:
                # dạng `: items.map(x => ( ... ))` - biểu thức trực tiếp
                mm = re.match(r'\s*:\s*([A-Za-z_][\w\.]*\.(?:map|filter|forEach)\()', rest2)
                if not mm:
                    continue
                data_open = close_empty + 1 + mm.end() - 1
                try:
                    close_data = match_paren(content, data_open)
                except ValueError:
                    continue
                data_expr = mm.group(1) + content[data_open + 1:close_data] + ')'
            # phải kết thúc bằng `}` của biểu thức JSX
            after = content[close_data + 1:close_data + 3]
            if not after.lstrip().startswith('}'):
                continue

            load_block = content[open_paren + 1:close_load].strip()
            empty_block = content[empty_open + 1:close_empty].strip()
            data_block = data_expr.strip()
            var = em.group(1)

            if not (data_block.startswith('{') or data_block.startswith('<')):
                data_block = '{' + data_block + '}'
            is_table = '<tr' in data_block or '<tbody' in data_block
            comp = 'TableState' if is_table else 'DataState'

            has_error = detect_error_var(content)
            retry_fn = detect_retry_fn(content)
            error_prop = f'error={{error ? new Error(error) : undefined}}' if has_error else ''
            retry_prop = f'onRetry={{{retry_fn}}}' if retry_fn else ''

            if comp == 'TableState':
                # TableState render <tr> => phần data phải là các <tr>, không phải <tbody>
                inner = data_block
                if '<tbody' in inner:
                    m_tb = re.search(r'<tbody[^>]*>(.*)</tbody>', inner, re.S)
                    if m_tb:
                        inner = m_tb.group(1)
                new = (
                    f'<{comp}\n'
                    f'          loading={{loading}}\n'
                    f'          empty={{!loading && {var}.length === 0}}\n'
                    f'          {error_prop}\n'
                    f'          {retry_prop}\n'
                    f'          colSpan={{6}}\n'
                    f'          emptyContent={{{empty_block}}}\n'
                    f'        >\n'
                    f'          {inner}\n'
                    f'        </{comp}>'
                )
            else:
                new = (
                    f'<{comp}\n'
                    f'          loading={{loading}}\n'
                    f'          empty={{!loading && {var}.length === 0}}\n'
                    f'          {error_prop}\n'
                    f'          {retry_prop}\n'
                    f'          emptyContent={{{empty_block}}}\n'
                    f'        >\n'
                    f'          {data_block}\n'
                    f'        </{comp}>'
                )

            start = m.start()
            end = close_data + 1
            # bỏ dấu `}` cuối cùng của biểu thức
            if content[end:end + 1] == '}':
                end += 1
            content = content[:start] + new + content[end:]
            count += 1
            changed = True
            break
    return content, count


def ensure_import(content: str, name: str) -> str:
    if re.search(r"import\s*\{[^}]*\b" + name + r"\b[^}]*\}\s*from\s*'ui-components'", content):
        return content
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if line.startswith('import '):
            lines.insert(i, f"import {{ {name} }} from 'ui-components';")
            return '\n'.join(lines)
    return content



def migrate_loading_only(content: str):
    """Shape: {loading ? ( <LOAD/> ) : ( <DATA/> )} -> <DataState loading> ..."""
    count = 0
    changed = True
    while changed:
        changed = False
        for m in re.finditer(r'\{loading \? \(', content):
            open_paren = m.end() - 1
            try:
                close_load = match_paren(content, open_paren)
            except ValueError:
                continue
            rest = content[close_load + 1:]
            dm = re.match(r'\s*:\s*\(', rest)
            if not dm:
                continue
            data_open = close_load + 1 + dm.end() - 1
            try:
                close_data = match_paren(content, data_open)
            except ValueError:
                continue
            if not content[close_data + 1:close_data + 2] == '}':
                continue
            data_block = content[data_open + 1:close_data].strip()
            if not (data_block.startswith('{') or data_block.startswith('<')):
                data_block = '{' + data_block + '}'
            is_table = '<tr' in data_block or '<tbody' in data_block
            comp = 'TableState' if is_table else 'DataState'
            if is_table:
                inner = data_block
                m_tb = re.search(r'<tbody[^>]*>(.*)</tbody>', inner, re.S)
                if m_tb:
                    inner = m_tb.group(1)
                new = (f'<{comp}\n          loading={{loading}}\n          colSpan={{6}}\n        >\n'
                       f'          {inner}\n        </{comp}>')
            else:
                new = (f'<{comp}\n          loading={{loading}}\n        >\n'
                       f'          {data_block}\n        </{comp}>')
            content = content[:m.start()] + new + content[close_data + 2:]
            count += 1
            changed = True
            break
    return content, count

def main() -> int:
    total = 0
    touched = []
    for portal in PORTALS:
        for root, _dirs, files in os.walk(os.path.join(portal, 'src/app')):
            for name in files:
                if name != 'page.tsx':
                    continue
                path = os.path.join(root, name)
                src = open(path, encoding='utf-8').read()
                new, n = migrate(src)
                if n == 0:
                    new, n2 = migrate_loading_only(src)
                    n = n2
                if n:
                    new = ensure_import(new, 'TableState' if 'TableState' in new else 'DataState')
                    open(path, 'w', encoding='utf-8').write(new)
                    total += n
                    touched.append((path.replace('frontend/', ''), n))
    print(f'đã migrate {total} block trong {len(touched)} trang')
    for path, n in touched:
        print(f'  {n}  {path}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
