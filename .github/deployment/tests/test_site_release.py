"""Offline only, disposable container /var/www. Never connects to production."""
import hashlib,io,os,pathlib,shutil,subprocess,tarfile,tempfile,unittest
ROOT=pathlib.Path('/var/www/vhosts/sweetwaterurbanfarms.com/micro.sproutify.app/httpdocs')
SCRIPT='/repo/.github/deployment/site-release-deploy.sh'
RELEASE=os.environ.get('DEPLOY_TEST_RELEASE','farm-catalogue-v1-20261019-rc2')
def digest(data): return hashlib.sha256(data).hexdigest()
class SiteReleaseTests(unittest.TestCase):
 def setUp(self):
  assert os.environ.get('DEPLOY_TEST_SANDBOX')=='1'
  if ROOT.exists(): shutil.rmtree(ROOT)
  (ROOT/'admin/assets').mkdir(parents=True)
  (ROOT/'assets').mkdir()
  for folder,body in [(ROOT,b'old marketing'),(ROOT/'admin',b'old admin')]:
   (folder/'index.html').write_bytes(body); (folder/'.htaccess').write_bytes(b'preserve routing')
   (folder/'assets/old.js').write_bytes(b'old asset')
  self.tmp=tempfile.TemporaryDirectory(); self.home=pathlib.Path(self.tmp.name)
  self.root_hash=digest(b'old marketing');self.admin_hash=digest(b'old admin')
 def tearDown(self): self.tmp.cleanup()
 def archive(self,mode='good'):
  path=self.home/'payload.tar.gz'
  files={'admin/index.html':b'<script src="/admin/assets/index-new.js"></script>','admin/assets/index-new.js':b'app','marketing/index.html':b'<script src="/assets/index-new.js"></script>','marketing/assets/index-new.js':b'marketing'}
  files['SHA256SUMS']=''.join(digest(v)+'  '+k+'\n' for k,v in files.items()).encode()
  files['RELEASE.json']=b'{}'
  if mode=='corrupt': files['admin/assets/index-new.js']=b'corrupted'
  with tarfile.open(path,'w:gz') as archive:
   for name,data in files.items():
    member=tarfile.TarInfo(name);member.size=len(data);archive.addfile(member,io.BytesIO(data))
   if mode=='link':
    member=tarfile.TarInfo('marketing/assets/link');member.type=tarfile.SYMTYPE;member.linkname='/etc/passwd';archive.addfile(member)
  return path
 def run_deploy(self,path,extra=None):
  env={**os.environ,'HOME':str(self.home),**(extra or {})}
  return subprocess.run(['bash',SCRIPT,str(path),digest(path.read_bytes()),RELEASE,self.root_hash,self.admin_hash],env=env,capture_output=True,text=True)
 def unchanged(self):
  self.assertEqual((ROOT/'index.html').read_bytes(),b'old marketing');self.assertEqual((ROOT/'admin/index.html').read_bytes(),b'old admin')
 def test_publish_and_idempotence_preserve_old_assets_config_and_backups(self):
  path=self.archive();result=self.run_deploy(path);self.assertEqual(result.returncode,0,result.stderr)
  self.assertIn('DEPLOYED_RELEASE=',result.stdout)
  for folder in [ROOT,ROOT/'admin']:
   self.assertEqual((folder/'.htaccess').read_bytes(),b'preserve routing');self.assertTrue((folder/'assets/old.js').exists());self.assertTrue((folder/'assets/index-new.js').exists())
  self.assertTrue((self.home/'.sproutify-releases'/f'{RELEASE}-before/backup.sha256').exists())
  self.assertEqual(self.run_deploy(path).returncode,0)
 def test_changed_baseline_refuses_before_replacement(self):
  (ROOT/'index.html').write_bytes(b'other release');self.assertNotEqual(self.run_deploy(self.archive()).returncode,0)
  self.assertEqual((ROOT/'index.html').read_bytes(),b'other release');self.assertFalse((ROOT/'admin/assets/index-new.js').exists())
 def test_bad_checksums_refuse_before_replacement(self):
  self.assertNotEqual(self.run_deploy(self.archive('corrupt')).returncode,0);self.unchanged()
 def test_archive_links_refuse_before_replacement(self):
  self.assertNotEqual(self.run_deploy(self.archive('link')).returncode,0);self.unchanged()
 def test_live_links_refuse_before_replacement(self):
  (ROOT/'assets/link').symlink_to('/etc/passwd');self.assertNotEqual(self.run_deploy(self.archive()).returncode,0);self.unchanged()
 def test_actual_frozen_payload_publishes_and_retains_previous_assets(self):
  path=pathlib.Path('/repo/.github/deployment/releases')/RELEASE/'payload.tar.gz'
  result=self.run_deploy(path);self.assertEqual(result.returncode,0,result.stderr)
  self.assertIn(b'/admin/assets/index-',(ROOT/'admin/index.html').read_bytes());self.assertIn(b'/assets/index-',(ROOT/'index.html').read_bytes())
  self.assertEqual(len(list((ROOT/'admin/assets').glob('*.webp'))),27)
  self.assertTrue((ROOT/'admin/assets/old.js').exists());self.assertTrue((ROOT/'assets/old.js').exists())
 def test_actual_frozen_checksums_are_portable_lf(self):
  path=pathlib.Path('/repo/.github/deployment/releases')/RELEASE/'payload.tar.gz'
  with tarfile.open(path,'r:gz') as archive:
   manifest=archive.extractfile('SHA256SUMS').read()
  self.assertNotIn(b'\r',manifest,'Older hosting sha256sum treats CR as part of filenames')
  self.assertTrue(manifest.endswith(b'\n'))
 def test_second_index_failure_restores_both_indexes(self):
  fake=self.home/'bin';fake.mkdir();wrapper=fake/'mv'
  wrapper.write_text('#!/bin/bash\necho "$*" >> "$HOME/mv-calls"\nif [[ "$2" == */httpdocs/.index-farm-catalogue* ]]; then exit 77; fi\nexec /bin/mv "$@"\n');wrapper.chmod(0o755)
  result=self.run_deploy(self.archive(),{'PATH':str(fake)+':'+os.environ['PATH']})
  self.assertNotEqual(result.returncode,0,result.stdout+'\n'+result.stderr+'\n'+str((self.home/'mv-calls').read_text() if (self.home/'mv-calls').exists() else 'wrapper not called'));self.assertIn('Prior indexes restored',result.stderr);self.unchanged()
if __name__=='__main__': unittest.main(verbosity=2)
