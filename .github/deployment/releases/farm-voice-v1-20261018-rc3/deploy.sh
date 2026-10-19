#!/usr/bin/env bash
set -euo pipefail
fail() { echo "Farm deployment refused: $*" >&2; exit 1; }
[[ $# == 3 ]] || fail 'Usage: deploy.sh ARCHIVE ARCHIVE_SHA256 RELEASE_ID'
archive=$1
digest=$2
release=$3
[[ $digest =~ ^[a-f0-9]{64}$ && $release =~ ^farm-voice-v1-[0-9]{8}-rc[0-9]+$ ]] || fail 'Invalid release identity'
target=/var/www/vhosts/sweetwaterurbanfarms.com/micro.sproutify.app/httpdocs/admin
baseline=ec051a87a9812abe03859904cda1d8099d2419e6806eba3c6973a4b86a0d11ec
config_baseline=fa86d029711a7914da089b0e4915f6763a43cd712fdaa80cdce52fa2917e0446
[[ -d "$target" && ! -L "$target" && $(realpath -e "$target") == "$target" ]] || fail 'Exact confirmed admin directory is required'
[[ -f "$target/index.html" && ! -L "$target/index.html" ]] || fail 'Existing admin index is required'
[[ $(sha256sum < "$archive" | cut -d' ' -f1) == "$digest" ]] || fail 'Archive digest mismatch'
command -v rsync >/dev/null || fail 'rsync must already be installed'
command -v python3 >/dev/null || fail 'python3 must already be installed'
umask 077
recovery="$HOME/.sproutify-releases"
mkdir -p "$recovery"
recovery=$(realpath -e "$recovery")
case "$recovery/" in "${target%/admin}/"*) fail 'Recovery directory cannot be in the public site' ;; esac
stage=$(mktemp -d "$recovery/$release-stage.XXXXXX")
# Reject archive paths/links before extraction. No cleanup of production directories occurs.
python3 - "$archive" "$stage" <<'PY'
import inspect, pathlib, sys, tarfile
with tarfile.open(sys.argv[1], 'r:gz') as archive:
    members = archive.getmembers()
    assert 0 < len(members) < 100, 'Unexpected archive size'
    total = 0
    for member in members:
        path = pathlib.PurePosixPath(member.name)
        assert not path.is_absolute() and '..' not in path.parts and '\\' not in member.name
        assert member.isfile() or member.isdir(), 'Links and special files are forbidden'
        assert member.name in ('SHA256SUMS', 'RELEASE.json') or member.name == 'admin' or member.name.startswith('admin/'), 'Unexpected archive root'
        assert '.htaccess' not in path.parts and not any(p.startswith('.env') for p in path.parts), 'Configuration/secret file forbidden'
        total += member.size
    assert total < 20 * 1024 * 1024, 'Archive is too large'
    kwargs = {'filter': 'data'} if 'filter' in inspect.signature(archive.extractall).parameters else {}
    archive.extractall(sys.argv[2], members=members, **kwargs)
PY
( cd "$stage" && sha256sum -c SHA256SUMS )
[[ -s "$stage/admin/index.html" && -d "$stage/admin/assets" ]] || fail 'Missing compiled frontend'
grep -q '/admin/assets/index-' "$stage/admin/index.html" || fail 'Wrong app base URL'
[[ ! -e "$stage/admin/.htaccess" ]] || fail 'Hosting configuration is never part of this upload'
[[ -z $(find -P "$target" -mindepth 1 ! -type f ! -type d -print -quit) ]] || fail 'Review live links/special files before deployment'
new_index=$(sha256sum < "$stage/admin/index.html" | cut -d' ' -f1)
old_index=$(sha256sum < "$target/index.html" | cut -d' ' -f1)
[[ $old_index == "$baseline" || $old_index == "$new_index" ]] || fail 'Production changed after hosting inspection'
[[ -f "$target/.htaccess" && $(sha256sum < "$target/.htaccess" | cut -d' ' -f1) == "$config_baseline" ]] || fail 'Admin routing configuration changed'
root=${target%/admin}
fingerprint() { if [[ -f $1 ]]; then sha256sum < "$1" | cut -d' ' -f1; else echo missing; fi; }
root_index_before=$(fingerprint "$root/index.html")
root_config_before=$(fingerprint "$root/.htaccess")
backup="$recovery/$release-before"
if [[ ! -d "$backup" ]]; then
  [[ $old_index == "$baseline" ]] || fail 'New release is present without its recovery checkpoint'
  mkdir "$backup"
  tar -czf "$backup/admin-before.tar.gz" -C "$target" .
  cp "$target/index.html" "$backup/index.before.html"
  cp "$target/.htaccess" "$backup/admin.htaccess.before"
  sha256sum "$backup/admin-before.tar.gz" > "$backup/backup.sha256"
fi
[[ $(fingerprint "$backup/index.before.html") == "$baseline" ]] || fail 'Original recovery index is not verified'
# Upload files first, preserve old hashed assets and all hosting configuration, switch index last.
rsync --recursive --perms --chmod=D755,F644 --checksum --exclude=/index.html --exclude=/.htaccess -- "$stage/admin/" "$target/"
find "$stage/admin" -type f ! -name index.html -print0 | while IFS= read -r -d '' file; do
  relative=${file#"$stage/admin/"}
  [[ $(fingerprint "$target/$relative") == $(fingerprint "$file") ]] || fail "Uploaded bytes differ: $relative"
done
cp "$stage/admin/index.html" "$target/.index-$release"
chmod 644 "$target/.index-$release"
mv -f "$target/.index-$release" "$target/index.html"
[[ $(fingerprint "$target/index.html") == "$new_index" ]] || fail 'Published index mismatch'
[[ $(fingerprint "$target/.htaccess") == "$config_baseline" ]] || fail 'Admin hosting config changed'
[[ $(fingerprint "$root/index.html") == "$root_index_before" && $(fingerprint "$root/.htaccess") == "$root_config_before" ]] || fail 'Public site/config changed'
echo "DEPLOYED_RELEASE=$release"
echo "DEPLOYED_INDEX_SHA256=$new_index"
echo "RECOVERY_ARCHIVE=$backup/admin-before.tar.gz"
echo 'Public site, hosting configuration and previous assets preserved.'
