#!/usr/bin/env bash
set -euo pipefail
fail() { echo "Site release refused: $*" >&2; exit 1; }
[[ $# == 5 ]] || fail 'Expected archive, digest, release, previous root digest and previous admin digest'
archive=$1; digest=$2; release=$3; root_before=$4; admin_before=$5
[[ $release =~ ^farm-catalogue-v1-[0-9]{8}-rc[0-9]+$ && $digest =~ ^[a-f0-9]{64}$ && $root_before =~ ^[a-f0-9]{64}$ && $admin_before =~ ^[a-f0-9]{64}$ ]] || fail 'Invalid release identity'
root=/var/www/vhosts/sweetwaterurbanfarms.com/micro.sproutify.app/httpdocs
admin=$root/admin
fingerprint() { sha256sum < "$1" | cut -d' ' -f1; }
for target in "$root" "$admin"; do
  [[ -d $target && ! -L $target && $(realpath -e "$target") == "$target" ]] || fail 'Exact confirmed directory required'
  [[ -f $target/index.html && -f $target/.htaccess ]] || fail 'Existing index and routing required'
done
[[ -z $(find -P "$root" -mindepth 1 ! -type f ! -type d -print -quit) ]] || fail 'Review live links/special files'
[[ -z $(find -P "$root" -type f -links +1 -print -quit) ]] || fail 'Review live hardlinks'
[[ $(fingerprint "$archive") == "$digest" ]] || fail 'Archive checksum mismatch'
command -v rsync >/dev/null; command -v python3 >/dev/null
umask 077
recovery="$HOME/.sproutify-releases"
mkdir -p "$recovery"
recovery=$(realpath -e "$recovery")
case "$recovery/" in "$root/"*) fail 'Recovery cannot be public' ;; esac
stage=$(mktemp -d "$recovery/$release-stage.XXXXXX")
python3 - "$archive" "$stage" <<'PY'
import inspect,pathlib,sys,tarfile
with tarfile.open(sys.argv[1],'r:gz') as archive:
    members=archive.getmembers()
    assert 0 < len(members) < 200
    total=0
    for member in members:
        p=pathlib.PurePosixPath(member.name)
        assert not p.is_absolute() and '..' not in p.parts and '\\' not in member.name
        assert member.isfile() or member.isdir()
        assert member.name in ('SHA256SUMS','RELEASE.json','admin','marketing') or member.name.startswith(('admin/','marketing/'))
        assert '.htaccess' not in p.parts and not any(x.startswith('.env') for x in p.parts)
        assert not member.name.startswith('marketing/admin/') and member.name!='marketing/admin'
        total+=member.size
    assert total<20*1024*1024
    kwargs={'filter':'data'} if 'filter' in inspect.signature(archive.extractall).parameters else {}
    archive.extractall(sys.argv[2],members=members,**kwargs)
PY
(cd "$stage" && sha256sum -c SHA256SUMS)
grep -q '/admin/assets/index-' "$stage/admin/index.html" || fail 'Wrong app base'
grep -q '/assets/index-' "$stage/marketing/index.html" || fail 'Wrong marketing base'
[[ ! -e $stage/marketing/admin && ! -e $stage/marketing/.htaccess && ! -e $stage/admin/.htaccess ]] || fail 'Protected path in artifact'
new_root=$(fingerprint "$stage/marketing/index.html"); new_admin=$(fingerprint "$stage/admin/index.html")
[[ $(fingerprint "$root/index.html") == "$root_before" || $(fingerprint "$root/index.html") == "$new_root" ]] || fail 'Homepage changed after inspection'
[[ $(fingerprint "$admin/index.html") == "$admin_before" || $(fingerprint "$admin/index.html") == "$new_admin" ]] || fail 'App changed after inspection'
root_config=$(fingerprint "$root/.htaccess"); admin_config=$(fingerprint "$admin/.htaccess")
backup="$recovery/$release-before"
if [[ ! -d $backup ]]; then
  [[ $(fingerprint "$root/index.html") == "$root_before" && $(fingerprint "$admin/index.html") == "$admin_before" ]] || fail 'Recovery checkpoint missing'
  mkdir "$backup"
  tar --exclude='./admin' -czf "$backup/marketing-before.tar.gz" -C "$root" .
  tar -czf "$backup/admin-before.tar.gz" -C "$admin" .
  cp "$root/index.html" "$backup/marketing.index.html"
  cp "$admin/index.html" "$backup/admin.index.html"
  (cd "$backup" && sha256sum marketing-before.tar.gz admin-before.tar.gz > backup.sha256)
fi
[[ $(fingerprint "$backup/marketing.index.html") == "$root_before" && $(fingerprint "$backup/admin.index.html") == "$admin_before" ]] || fail 'Recovery indexes mismatch'
(cd "$backup" && sha256sum -c backup.sha256)
# No deletion. Retain old hashed assets and every hosting/config file.
rsync --recursive --perms --chmod=D755,F644 --checksum --exclude=/index.html --exclude=/.htaccess -- "$stage/admin/" "$admin/"
rsync --recursive --perms --chmod=D755,F644 --checksum --exclude=/admin --exclude=/index.html --exclude=/.htaccess -- "$stage/marketing/" "$root/"
for pair in admin marketing; do
  target=$root; [[ $pair != admin ]] || target=$admin
  while IFS= read -r -d '' file; do
    relative=${file#"$stage/$pair/"}
    [[ $(fingerprint "$target/$relative") == $(fingerprint "$file") ]] || fail "Transferred bytes differ: $relative"
  done < <(find "$stage/$pair" -type f ! -name index.html -print0)
done
rollback_indexes() {
  cp "$backup/admin.index.html" "$admin/.index-recovery-$release"; chmod 644 "$admin/.index-recovery-$release"; mv -f "$admin/.index-recovery-$release" "$admin/index.html"
  cp "$backup/marketing.index.html" "$root/.index-recovery-$release"; chmod 644 "$root/.index-recovery-$release"; mv -f "$root/.index-recovery-$release" "$root/index.html"
  echo 'Prior indexes restored; old assets retained.' >&2
}
trap rollback_indexes ERR
for pair in admin marketing; do
  target=$root; [[ $pair != admin ]] || target=$admin
  cp "$stage/$pair/index.html" "$target/.index-$release"
  chmod 644 "$target/.index-$release"
  mv -f "$target/.index-$release" "$target/index.html"
done
[[ $(fingerprint "$root/index.html") == "$new_root" && $(fingerprint "$admin/index.html") == "$new_admin" ]]
[[ $(fingerprint "$root/.htaccess") == "$root_config" && $(fingerprint "$admin/.htaccess") == "$admin_config" ]]
trap - ERR
echo "DEPLOYED_RELEASE=$release"
echo "RECOVERY_DIRECTORY=$backup"
echo 'Both indexes published; hosting configuration and previous assets preserved.'
