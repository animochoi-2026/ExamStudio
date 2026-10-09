import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('retention', Path(__file__).resolve().parents[1] / 'scripts/github-retention.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RetentionTests(unittest.TestCase):
    def fixtures(self):
        versions = ['0.4.9', '0.4.12', '0.4.8', '0.4.10', '0.4.11']
        self.manifests = {}
        self.releases = []
        self.deleted = []
        for i, version in enumerate(versions):
            tag = 'v' + version
            url = f'https://github.com/{module.REPO}/releases/download/{tag}/update.json'
            self.manifests[url] = dict(schema=1, platform='win32-x64', version=version, asset=f'ExamStudio-{version}-win32-x64.zip', size=20, sha256='a'*64)
            self.releases.append(dict(id=i+1, tag_name=tag, assets=[dict(name='update.json', state='uploaded', browser_download_url=url), dict(name=f'ExamStudio-{version}-win32-x64.zip', state='uploaded', size=20, digest='sha256:'+'a'*64)]))
        self.releases.extend([dict(id=99, tag_name='v9.0.0', draft=True), dict(id=100, tag_name='v8.0.0', prerelease=True), dict(id=101, tag_name='manual-backup')])

    def api(self, method, route):
        if method == 'DELETE': self.deleted.append(route); return None
        if route.startswith('releases?'): return self.releases
        if route == 'releases/latest': return next(r for r in self.releases if r['tag_name'] == 'v0.4.12')
        return next(r for r in self.releases if r['id'] == int(route.split('/')[-1]))

    def test_only_obsolete_stable_releases_and_exact_tags_deleted(self):
        self.fixtures()
        module.cleanup(self.api, self.manifests.__getitem__)
        self.assertEqual(self.deleted, ['releases/1', 'git/refs/tags/v0.4.9', 'releases/3', 'git/refs/tags/v0.4.8'])

    def test_dry_run_has_no_mutations(self):
        self.fixtures(); module.cleanup(self.api, self.manifests.__getitem__, True); self.assertEqual(self.deleted, [])

    def test_broken_retained_release_aborts_all_deletions(self):
        self.fixtures()
        next(m for m in self.manifests.values() if m['version'] == '0.4.10')['sha256'] = 'b'*64
        with self.assertRaises(ValueError): module.cleanup(self.api, self.manifests.__getitem__)
        self.assertEqual(self.deleted, [])

    def test_three_or_fewer_are_never_deleted(self):
        self.fixtures(); self.releases = [r for r in self.releases if r['tag_name'] in ['v0.4.12', 'v0.4.11']]
        module.cleanup(self.api, self.manifests.__getitem__); self.assertEqual(self.deleted, [])

    def test_incomplete_new_release_does_not_remove_rollback(self):
        self.fixtures(); next(r for r in self.releases if r['tag_name']=='v0.4.12')['assets'] = []
        with self.assertRaises(ValueError): module.cleanup(self.api, self.manifests.__getitem__)
        self.assertEqual(self.deleted, [])


if __name__ == '__main__': unittest.main()
