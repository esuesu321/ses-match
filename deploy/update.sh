#!/usr/bin/env bash
# Run as root on the server after initial setup. No credentials in arguments.
set -euo pipefail
umask 077
[[ $EUID -eq 0 && $# -eq 1 ]] || { echo 'Usage: sudo bash deploy/update.sh RELEASE.tar.gz'; exit 1; }
[[ -f /etc/ses-match/app.env && -d /opt/ses-match ]] || { echo 'Initial server setup is required'; exit 1; }
exec 9>/var/lock/ses-match-update.lock
flock -n 9 || { echo 'Another update is running'; exit 1; }
stage=$(mktemp -d /opt/ses-match-release.XXXXXXXX)
previous=''
success=false
cleanup() {
 if [[ -n $previous && -d $previous && $success != true ]]; then
  systemctl stop ses-match || true
  if [[ -d /opt/ses-match ]]; then mv /opt/ses-match "${stage}.failed"; fi
  mv "$previous" /opt/ses-match
  systemctl start ses-match || true
  echo 'Previous code restored. Database was not overwritten.'
 fi
 rm -rf -- "$stage"
}
trap cleanup EXIT
# Validate paths, links, manifest and checksums before unpacking anything.
python3 - "$1" "$stage" <<'PY'
import sys,tarfile,json,hashlib,pathlib
archive,target=sys.argv[1:]
with tarfile.open(archive,'r:gz') as tar:
    members=tar.getmembers()
    if len(members)>200:raise ValueError('Too many files')
    seen=set();payload={};total=0
    for m in members:
        if m.name in ('.','./') and m.isdir():continue
        name=m.name.removeprefix('./');p=pathlib.PurePosixPath(name)
        if p.is_absolute() or '..' in p.parts or name in seen:raise ValueError('Unsafe path')
        seen.add(name)
        if m.isdir():continue
        if not m.isfile() or m.size>2000000:raise ValueError('Invalid archive member')
        if name!='release.json' and name not in ('package.json','package-lock.json','server.mjs') and p.parts[0] not in ('lib','public','scripts','tests','deploy'):raise ValueError('Unexpected release file')
        total+=m.size
        if total>10000000:raise ValueError('Archive limit')
        payload[name]=tar.extractfile(m).read()
    manifest=json.loads(payload.pop('release.json'))
    if manifest['format']!=1 or set(manifest['files'])!=set(payload):raise ValueError('Invalid manifest')
    for name,data in payload.items():
        if hashlib.sha256(data).hexdigest()!=manifest['files'][name]:raise ValueError('Checksum mismatch')
    for name,data in payload.items():
        dest=pathlib.Path(target)/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
    (pathlib.Path(target)/'release.json').write_text(json.dumps(manifest))
PY
# Dependency install and tests run under the restricted app user, without secrets.
chmod 755 "$stage"
chown -R ses-match:ses-match "$stage"
runuser -u ses-match -- env -i HOME=/var/lib/ses-match PATH=/usr/bin:/bin bash -c 'cd "$1" && npm ci --ignore-scripts && npm test && npm run check' -- "$stage"
chown -R root:root "$stage"
chmod -R go-w "$stage"
mkdir -p /var/backups/ses-match
chmod 700 /var/backups/ses-match
key=/etc/ses-match/backup.key
if [[ ! -f $key ]]; then head -c 32 /dev/urandom > "$key"; chmod 600 "$key"; fi
backup="/var/backups/ses-match/$(date -u +%Y%m%dT%H%M%SZ).sesb"
# Snapshot before replacing code. Failure leaves the running application intact.
if [[ -f /var/lib/ses-match/ses.sqlite ]]; then
 /usr/bin/node "$stage/scripts/encrypted-backup.mjs" /var/lib/ses-match/ses.sqlite "$key" "$backup"
fi
previous="${stage}-previous"
systemctl stop ses-match
mv /opt/ses-match "$previous"
mv "$stage" /opt/ses-match
if systemctl start ses-match; then
 healthy=false
 for attempt in {1..10}; do
  if /usr/bin/node /opt/ses-match/scripts/check-server.mjs; then healthy=true; break; fi
  sleep 1
 done
 if [[ $healthy == true ]]; then success=true; echo 'Update verified'; exit 0; fi
fi
echo 'Update verification failed; restoring previous code.'
exit 1
