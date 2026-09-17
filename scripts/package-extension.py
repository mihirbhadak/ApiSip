"""Package the current production build and verify every archived byte (Python 3.9+)."""
from pathlib import Path
import hashlib
import json
import re
import zipfile

root = Path(__file__).resolve().parent.parent
dist = root / 'dist'
artifact = root / 'artifacts'
artifact.mkdir(exist_ok=True)
manifest = json.loads((dist / 'manifest.json').read_text(encoding='utf-8'))
root_manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
version = manifest['version']
assert re.fullmatch(r'\d+(?:\.\d+){1,3}', version)
assert root_manifest['background']['service_worker'] == 'dist/' + manifest['background']['service_worker']
for data, base in [(manifest, dist), (root_manifest, root)]:
    for name in [data['background']['service_worker'], *data['icons'].values(), *data['action']['default_icon'].values()]:
        target = (base / name).resolve()
        assert target.is_relative_to(base.resolve()) and target.is_file(), name
for html in dist.glob('*.html'):
    for name in re.findall(r'(?:src|href)="([^"]+)"', html.read_text(encoding='utf-8')):
        target = (html.parent / name).resolve()
        assert target.is_relative_to(dist) and target.is_file(), name
assert (dist / 'offscreen.html').is_file()
assert len(list((dist / 'assets').glob('runner.worker-*.js'))) == 1
assert 'webRequest' in manifest['optional_permissions']
assert manifest['optional_host_permissions'] == ['http://*/*', 'https://*/*']
files = sorted(path for path in dist.rglob('*') if path.is_file())
source_checks = 0
for file in dist.rglob('*.map'):
    data = json.loads(file.read_text(encoding='utf-8'))
    for name, content in zip(data.get('sources', []), data.get('sourcesContent', [])):
        path = (file.parent / name).resolve()
        if path.is_relative_to(root / 'src') and path.is_file() and path.suffix in ['.ts', '.tsx', '.css', '.json']:
            assert path.read_text(encoding='utf-8-sig') == content.replace('\r\n', '\n').lstrip('\ufeff'), str(path)
            source_checks += 1
archive = artifact / f'apisip-{version}.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zipped:
    for path in files:
        zipped.write(path, path.relative_to(dist).as_posix())
with zipfile.ZipFile(archive) as zipped:
    assert zipped.testzip() is None
    assert len(zipped.namelist()) == len(files)
    for path in files:
        assert zipped.read(path.relative_to(dist).as_posix()) == path.read_bytes()
sha = hashlib.sha256(archive.read_bytes()).hexdigest()
result = {
    **json.loads((dist / 'build-info.json').read_text()),
    'version': version, 'files': len(files), 'bytes': archive.stat().st_size,
    'sha256': sha, 'archiveIntegrity': True, 'matchesDist': True,
    'rootManifestValid': True, 'sourceMapSourcesVerified': source_checks,
}
(artifact / 'package-verification.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
(artifact / 'SHA256SUMS.txt').write_text(sha + '  ' + archive.name + '\n', encoding='utf-8')
print(json.dumps(result, indent=2))
