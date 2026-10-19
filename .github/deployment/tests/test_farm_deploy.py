"""Offline release/rollback rehearsal. Only runs inside the disposable test container."""
import hashlib
import io
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest

SCRIPT = Path('/repo/.github/deployment/farm-app-deploy.sh')
ROOT = Path('/var/www/vhosts/sweetwaterurbanfarms.com/micro.sproutify.app/httpdocs')
TARGET = ROOT / 'admin'
RELEASE = 'farm-voice-v1-20261018-rc3'

def digest(data):
    return hashlib.sha256(data).hexdigest()

class FarmDeployTests(unittest.TestCase):
    def setUp(self):
        self.assertEqual(os.environ.get('DEPLOY_TEST_SANDBOX'), '1')
        # /var/www is disposable container tmpfs, never a host mount.
        if ROOT.exists():
            shutil.rmtree(ROOT)
        TARGET.mkdir(parents=True)
        (ROOT / 'index.html').write_text('public-home-untouched')
        (ROOT / '.htaccess').write_text('public-routing-untouched')
        (TARGET / 'index.html').write_text('previous-admin')
        (TARGET / '.htaccess').write_text('admin-routing-untouched')
        (TARGET / 'assets').mkdir()
        (TARGET / 'assets/previous.js').write_text('old asset remains for rollback')
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name)
        self.script = self.home / 'deploy.sh'
        source = SCRIPT.read_text().replace('ec051a87a9812abe03859904cda1d8099d2419e6806eba3c6973a4b86a0d11ec', digest(b'previous-admin')).replace('fa86d029711a7914da089b0e4915f6763a43cd712fdaa80cdce52fa2917e0446', digest(b'admin-routing-untouched'))
        self.script.write_text(source)
        self.payload = self.home / 'payload.tar.gz'
        self.files = {'admin/index.html': b'<script src="/admin/assets/index-next.js"></script>', 'admin/assets/index-next.js': b'new tested app'}
        self.archive()

    def tearDown(self):
        self.tmp.cleanup()

    def archive(self, extra=None):
        files = dict(self.files)
        files['SHA256SUMS'] = ''.join(f'{digest(data)}  {name}\n' for name, data in self.files.items()).encode()
        files['RELEASE.json'] = b'{}'
        with tarfile.open(self.payload, 'w:gz') as archive:
            for name, data in files.items():
                entry = tarfile.TarInfo(name)
                entry.size = len(data)
                entry.mode = 0o600
                archive.addfile(entry, io.BytesIO(data))
            if extra:
                archive.addfile(extra)

    def run_deploy(self, expected=None, release=RELEASE):
        return subprocess.run(['bash', str(self.script), str(self.payload), expected or digest(self.payload.read_bytes()), release], env={**os.environ, 'HOME': str(self.home)}, capture_output=True, text=True)

    def unchanged(self):
        self.assertEqual((ROOT / 'index.html').read_text(), 'public-home-untouched')
        self.assertEqual((ROOT / '.htaccess').read_text(), 'public-routing-untouched')
        self.assertEqual((TARGET / '.htaccess').read_text(), 'admin-routing-untouched')

    def test_upload_preserves_public_site_config_old_assets_and_verified_rollback(self):
        result = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.unchanged()
        self.assertTrue((TARGET / 'assets/previous.js').exists())
        self.assertEqual((TARGET / 'assets/index-next.js').stat().st_mode & 0o777, 0o644)
        backup = self.home / '.sproutify-releases' / f'{RELEASE}-before/admin-before.tar.gz'
        with tarfile.open(backup) as archive:
            self.assertEqual(archive.extractfile('./index.html').read(), b'previous-admin')
        # Rehearse rollback of original entry/config/content into a separate offline directory.
        restored = self.home / 'restored'
        restored.mkdir()
        with tarfile.open(backup) as archive:
            archive.extractall(restored)
        self.assertEqual((restored / 'index.html').read_bytes(), b'previous-admin')
        self.assertEqual((restored / '.htaccess').read_text(), 'admin-routing-untouched')
        self.assertEqual(self.run_deploy().returncode, 0)

    def test_wrong_digest_does_not_change_production(self):
        self.assertNotEqual(self.run_deploy('0' * 64).returncode, 0)
        self.assertEqual((TARGET / 'index.html').read_text(), 'previous-admin')
        self.unchanged()

    def test_actual_frozen_package_uses_linux_checksums_and_deploys(self):
        frozen = Path('/repo/.github/deployment/releases') / RELEASE
        self.payload = frozen / 'payload.tar.gz'
        with tarfile.open(self.payload) as archive:
            sums = archive.extractfile('SHA256SUMS').read()
            self.assertNotIn(b'\r', sums)
            for line in sums.decode().splitlines():
                expected, name = line.split('  ', 1)
                self.assertEqual(digest(archive.extractfile(name).read()), expected)
            expected_index = archive.extractfile('admin/index.html').read()
        result = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertEqual((TARGET / 'index.html').read_bytes(), expected_index)
        self.unchanged()

    def test_production_drift_is_refused(self):
        (TARGET / 'index.html').write_text('someone-changed-production')
        self.assertNotEqual(self.run_deploy().returncode, 0)
        self.assertEqual((TARGET / 'index.html').read_text(), 'someone-changed-production')
        self.unchanged()

    def test_routing_config_drift_is_refused(self):
        (TARGET / '.htaccess').write_text('changed-routing')
        self.assertNotEqual(self.run_deploy().returncode, 0)
        self.assertEqual((TARGET / 'index.html').read_text(), 'previous-admin')

    def test_archive_traversal_and_symlink_are_rejected(self):
        for name, kind in [('../escape', tarfile.REGTYPE), ('admin/link', tarfile.SYMTYPE)]:
            extra = tarfile.TarInfo(name)
            extra.type = kind
            extra.linkname = '/etc/passwd'
            self.archive(extra)
            self.assertNotEqual(self.run_deploy().returncode, 0)
            self.assertEqual((TARGET / 'index.html').read_text(), 'previous-admin')
            self.unchanged()

    def test_hosting_configuration_is_forbidden_in_archive(self):
        self.files['admin/.htaccess'] = b'bad replacement'
        self.archive()
        self.assertNotEqual(self.run_deploy().returncode, 0)
        self.unchanged()

    def test_release_path_injection_is_refused(self):
        self.assertNotEqual(self.run_deploy(release='../other').returncode, 0)
        self.unchanged()

if __name__ == '__main__':
    unittest.main(verbosity=2)
