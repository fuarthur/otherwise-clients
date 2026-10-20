"""Package public client sources; no backend, model or external dependencies."""
from pathlib import Path
import json
import shutil
import zipfile
from public_boundary import ROOT, ASSETS, validate_assets, validate_tree, validate_path, require


def build(root=ROOT, output=None):
    validate_tree(root)
    catalog, _ = validate_assets(root)
    output = Path(output) if output is not None else root / 'dist'
    destination = output / 'otherwise-extension'
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)
    for path in sorted((root / 'extension').rglob('*')):
        relative = path.relative_to(root / 'extension')
        if 'tests' in relative.parts or path.name == '.DS_Store':
            continue
        require(not path.is_symlink(), f'Symlink cannot enter the package: {relative}')
        if path.is_file():
            validate_path(Path('extension') / relative)
            target = destination / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, target)
    for name in ASSETS:
        shutil.copyfile(root / 'client-assets' / name, destination / name)
    (destination / 'subject-domains.json').write_text(json.dumps(
        sorted({row['domain'] for row in catalog}), ensure_ascii=False, separators=(',', ':')))
    for name in ['LICENSE', 'THIRD_PARTY_NOTICES.md']:
        shutil.copyfile(root / name, destination / name)
    archive = output / 'OtherWise-extension.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as package:
        for path in sorted(destination.rglob('*')):
            if path.is_file():
                package.write(path, path.relative_to(output))
    print(f'Built {len(catalog):,} public topics: {destination}')
    print(f'Install archive: {archive}')
    return destination, archive


if __name__ == '__main__':
    build()
