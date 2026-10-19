"""Freeze compiled farm assets only; never rebuild inside the deployment job."""
import hashlib
import json
from pathlib import Path
import shutil
import tarfile

root = Path(__file__).resolve().parents[1]
release = 'farm-voice-v1-20261018-rc3'
source = root / 'local-qa/today-growing/production-voice-dist'
destination = root / '.github/deployment/releases' / release
destination.mkdir(exist_ok=False)
staging = root / 'local-qa/today-growing' / f'{release}-stage'
staging.mkdir(exist_ok=False)
(staging / 'admin').mkdir()
checksums = []
for file in sorted(source.rglob('*')):
    if not file.is_file():
        continue
    relative = file.relative_to(source)
    if '.htaccess' in relative.parts:
        continue
    assert not file.is_symlink() and not any(p.startswith('.env') for p in relative.parts)
    output = staging / 'admin' / relative
    output.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(file, output)
    checksums.append((f'admin/{relative.as_posix()}', hashlib.sha256(output.read_bytes()).hexdigest()))
assert len(checksums) == 8, f'Unexpected compiled file count: {len(checksums)}'
# sha256sum treats CR as part of a filename on Linux. Write platform-neutral bytes.
(staging / 'SHA256SUMS').write_bytes(''.join(f'{digest}  {name}\n' for name, digest in checksums).encode('utf8'))
metadata = {'release': release, 'savingEnabled': False, 'backend': 'farm-assistant', 'realtimeModel': 'gpt-realtime-2.1', 'files': dict(checksums)}
(staging / 'RELEASE.json').write_text(json.dumps(metadata, indent=2), encoding='utf8')
archive = destination / 'payload.tar.gz'
with tarfile.open(archive, 'w:gz') as output:
    for file in sorted(staging.rglob('*')):
        output.add(file, arcname=file.relative_to(staging).as_posix(), recursive=False)
shutil.copyfile(root / '.github/deployment/farm-app-deploy.sh', destination / 'deploy.sh')
result = {'release': release, 'archiveSha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'scriptSha256': hashlib.sha256((destination / 'deploy.sh').read_bytes()).hexdigest(), 'bytes': archive.stat().st_size, 'files': len(checksums)}
(destination / 'manifest.json').write_text(json.dumps(result, indent=2), encoding='utf8')
print(json.dumps(result))
