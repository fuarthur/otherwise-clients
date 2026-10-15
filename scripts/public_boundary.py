"""Validate the intentionally small public source and resource boundary."""
import json
import math
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
ROOT_FILES = {'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'package.json', '.gitignore'}
ASSETS = {'catalog.json', 'galaxy-layout.json', 'interest-input.json'}
BROWSER_TEST = re.compile(r'test_[a-z_]+_browser\.mjs')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_path(path):
    parts = path.parts
    require(not path.is_absolute() and not any(p.startswith('.') or p == '__pycache__' for p in parts[1:]),
            f'Hidden or private source path: {path}')
    if len(parts) == 1:
        require(str(path) in ROOT_FILES, f'Unexpected root file: {path}')
        return
    parent, suffix = parts[0], path.suffix
    permitted = (
        parent == 'extension' and (suffix in {'.js', '.html', '.css', '.wav', '.md'} or
        str(path) in {'extension/manifest.json', 'extension/focus-preview.v1.json', 'extension/assets/sounds/provenance.json'}) or
        parent in {'website', 'introduction-site'} and suffix in {'.html', '.css', '.js', '.png', '.svg'} or
        parent == 'client-assets' and len(parts) == 2 and path.name in ASSETS or
        parent == 'scripts' and len(parts) == 2 and
        (path.name in {'build_extension.py', 'public_boundary.py'} or BROWSER_TEST.fullmatch(path.name)) or
        parent == 'tests' and len(parts) == 2 and path.name == 'test_public_package.py' or
        parent == 'docs' and len(parts) == 2 and path.name in {'web.md', 'development.md'} or
        str(path) == '.github/workflows/checks.yml'
    )
    require(permitted, f'Outside the public source allowlist: {path}')


def validate_tree(root=ROOT):
    if (root / '.git').exists():
        raw = subprocess.check_output(['git', 'ls-files', '-co', '--exclude-standard', '-z'], cwd=root)
        files = sorted(set(Path(name) for name in raw.decode().split('\0') if name))
    else:
        # GitHub source archives have no Git metadata. Ignore only local build/tool
        # output, and validate every remaining path rather than trusting suffixes.
        files = []
        ignored = {'.git', 'dist', 'node_modules', '.cache', '__pycache__'}
        for directory, directories, filenames in os.walk(root, followlinks=False):
            base = Path(directory)
            for name in directories:
                child = base / name
                require(not child.is_symlink(), f'Symlink is not public source: {child.relative_to(root)}')
                require(name != '.git' or base == root, 'Nested Git metadata is not public source')
            directories[:] = [name for name in directories if name not in ignored]
            files.extend((base / name).relative_to(root) for name in filenames
                         if name != '.DS_Store' and not name.endswith(('.pyc', '.pyo')))
        files.sort()
    for rel in files:
        validate_path(rel)
        require(not (root / rel).is_symlink(), f'Symlink is not a public source file: {rel}')
        require((root / rel).is_file(), f'Not a regular public source file: {rel}')
    return files


def exact(value, keys):
    return isinstance(value, dict) and set(value) == set(keys)


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def validate_assets(root=ROOT):
    load = lambda name: json.loads((root / 'client-assets' / name).read_text())
    catalog, layout, meanings = (load(name) for name in ['catalog.json', 'galaxy-layout.json', 'interest-input.json'])
    require(isinstance(catalog, list) and len(catalog) > 0, 'Missing public catalog')
    require(all(exact(row, ['id', 'topic', 'domain', 'description']) and
                all(isinstance(v, str) for v in row.values()) and row['id'] == row['topic'] and
                row['id'] and row['domain'] for row in catalog), 'Unexpected catalog fields')
    ids = {row['id'] for row in catalog}
    domains = {row['domain'] for row in catalog}
    require(len(ids) == len(catalog), 'Duplicate public catalog IDs')
    require(exact(layout, ['schema_version', 'cache_key', 'metadata', 'topics', 'domains']) and
            layout['schema_version'] == 1 and isinstance(layout['cache_key'], str) and layout['cache_key'], 'Invalid layout envelope')
    meta = layout['metadata']
    require(exact(meta, ['catalog_sha256', 'model', 'embedding']) and
            re.fullmatch(r'[a-f0-9]{64}', meta['catalog_sha256']) and isinstance(meta['model'], str) and meta['model'],
            'Private or invalid map metadata')
    embedding = meta['embedding']
    require(exact(embedding, ['sha256', 'dtype', 'shape']) and re.fullmatch(r'[a-f0-9]{64}', embedding['sha256']) and
            embedding['dtype'] in {'float32', 'float64'} and embedding['shape'] == [len(catalog), 768],
            'Private or invalid compatibility identity')
    require(isinstance(layout['topics'], list) and len(layout['topics']) == len(ids) and
            {row.get('id') for row in layout['topics']} == ids, 'Layout topic IDs must exactly match catalog')
    require(isinstance(layout['domains'], list) and len(layout['domains']) == len(domains) and
            {row.get('id') for row in layout['domains']} == domains, 'Layout domains must exactly match catalog')
    for row in [*layout['topics'], *layout['domains']]:
        keys = ['id', 'x', 'y', 'neighbors'] if 'neighbors' in row else ['id', 'x', 'y']
        require(exact(row, keys) and all(number(row[k]) and abs(row[k]) < 1e6 for k in ['x', 'y']), 'Unexpected map point fields')
    for row in layout['topics']:
        require(exact(row, ['id', 'x', 'y', 'neighbors']) and isinstance(row['neighbors'], list), 'Missing map neighbors')
        seen = set()
        for neighbor in row['neighbors']:
            require(exact(neighbor, ['id', 'distance']) and neighbor['id'] in ids and neighbor['id'] != row['id'] and
                    neighbor['id'] not in seen and number(neighbor['distance']) and 0 <= neighbor['distance'] <= 1,
                    'Invalid public map neighbor')
            seen.add(neighbor['id'])
    require(exact(meanings, ['schemaVersion', 'senses']) and meanings['schemaVersion'] == 1 and isinstance(meanings['senses'], list),
            'Invalid input meanings')
    for row in meanings['senses']:
        require(exact(row, ['id', 'label', 'description', 'catalogIds', 'aliases']) and
                all(isinstance(row[k], str) for k in ['id', 'label', 'description']) and
                isinstance(row['catalogIds'], list) and all(i in ids for i in row['catalogIds']) and
                isinstance(row['aliases'], list) and all(isinstance(a, str) for a in row['aliases']), 'Private or invalid input meaning fields')
    return catalog, layout


if __name__ == '__main__':
    files = validate_tree()
    catalog, layout = validate_assets()
    print(f'Public boundary verified: {len(files)} source files, {len(catalog):,} topics, {len(layout["domains"])} domains.')
