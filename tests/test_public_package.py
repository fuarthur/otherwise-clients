import importlib.util
import json
import shutil
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from public_boundary import validate_assets, validate_path, validate_tree
from build_extension import build


class PublicPackageTests(unittest.TestCase):
    def test_private_paths_and_nested_checkouts_are_rejected(self):
        for name in ['service/app.py', 'galaxy/layout.py', 'explorer.py', '.env',
                     'extension/.env', 'extension/vendor/.git/config', 'client-assets/model.npy',
                     'data/topics.json', 'extension/debug.log', 'scripts/start_demo.py']:
            with self.subTest(name=name), self.assertRaises(ValueError):
                validate_path(Path(name))

    def test_renderable_assets_are_complete_without_private_generation_metadata(self):
        catalog, layout = validate_assets(ROOT)
        self.assertEqual(len(catalog), len(layout['topics']))
        self.assertEqual(set(layout['metadata']), {'catalog_sha256', 'model', 'embedding'})

    def test_private_metadata_is_rejected_before_packaging(self):
        self._bad_assets(lambda layout: layout['metadata'].update(parameters={'internal': 1}))

    def test_missing_topic_is_rejected_before_packaging(self):
        self._bad_assets(lambda layout: layout['topics'].pop())

    def test_foreign_neighbor_is_rejected_before_packaging(self):
        self._bad_assets(lambda layout: layout['topics'][0]['neighbors'].append({'id': 'not-in-catalog', 'distance': .1}))

    def _bad_assets(self, mutate):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'client-assets').mkdir()
            for name in ['catalog.json', 'galaxy-layout.json', 'interest-input.json']:
                content = json.loads((ROOT / 'client-assets' / name).read_text())
                if name == 'galaxy-layout.json':
                    mutate(content)
                (root / 'client-assets' / name).write_text(json.dumps(content))
            with self.assertRaises(ValueError):
                validate_assets(root)

    def test_downloaded_source_archive_builds_without_git_metadata(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for rel in validate_tree(ROOT):
                target = root / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / rel, target)
            destination, archive = build(root)
            self.assertTrue(archive.is_file())
            self.assertTrue((destination / 'manifest.json').is_file())

    def test_ignored_credentials_cannot_enter_archive(self):
        secret = ROOT / 'extension' / '.env'
        secret.write_text('PRIVATE_SETTING=fictional-regression-fixture\n')
        try:
            with tempfile.TemporaryDirectory() as folder:
                with self.assertRaises(ValueError):
                    build(ROOT, Path(folder))
        finally:
            secret.unlink()

    def test_archive_contains_client_assets_and_license_but_no_tests_or_service(self):
        with tempfile.TemporaryDirectory() as folder:
            destination, archive = build(ROOT, Path(folder))
            with zipfile.ZipFile(archive) as package:
                names = package.namelist()
                self.assertIn('otherwise-extension/manifest.json', names)
                self.assertIn('otherwise-extension/LICENSE', names)
                self.assertIn('otherwise-extension/THIRD_PARTY_NOTICES.md', names)
                self.assertIn('otherwise-extension/galaxy-layout.json', names)
                self.assertIn('otherwise-extension/subject-domains.json', names)
                fields = json.loads(package.read('otherwise-extension/subject-domains.json'))
                catalog = json.loads(package.read('otherwise-extension/catalog.json'))
                self.assertEqual(fields, sorted({row['domain'] for row in catalog}))
                self.assertFalse(any('/tests/' in name or name.endswith(('.py', '.ipynb', '.npy')) for name in names))
                self.assertEqual(len(names), len(set(names)))


if __name__ == '__main__':
    unittest.main()
