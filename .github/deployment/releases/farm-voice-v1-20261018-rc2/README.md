# Farm voice RC2 — prepared, not yet deployed

Frozen production-enabled frontend, 8 published files, 839,078-byte payload. The deployment job uploads this exact package; it does not install dependencies or rebuild the checkout.

- Archive SHA-256: `ede28c15cc5a4e339cd0344d4dfe7993f523d318aea5529a856c9e0b4b547e53`
- Script SHA-256: `2ffba1d2ed1c2ed2156fec8106ec26a8d0156ee5e2dd2a527c2b8dae0e66ae38`
- New index SHA-256: `a7652f7d6e90de705f6edd1789e90dd010c5a45f7e67348d50426720cd89fa3c`
- New JS: `index-M7jRDcpB.js`; CSS: `index-BPwTr2o2.css`.

The private archive metadata and deployment script stay outside the public webroot. Only compiled `admin/` contents are uploaded. The public homepage, root/admin `.htaccess`, old hashed assets and all data remain intact.

The existing SSH deployment connection confirmed the canonical admin target:

`/var/www/vhosts/sweetwaterurbanfarms.com/micro.sproutify.app/httpdocs/admin`

Read-only inspection matched both live `/admin/` and `/admin/index.html` to existing index SHA `ec051a87a9812abe03859904cda1d8099d2419e6806eba3c6973a4b86a0d11ec`. Existing admin `.htaccess` SHA is `fa86d029711a7914da089b0e4915f6763a43cd712fdaa80cdce52fa2917e0446`. Python 3.10.12, rsync, tar and sha256sum are installed. Inspection runs: 39182230439 and 39182705610.

## Release sequence

1. Explicitly approve private key binding to Supabase project `rmjyfdmwnmaerthcoosq` as `FARM_ASSISTANT_OPENAI_API_KEY`, plus new read-only `farm-assistant` Edge Function. Automatic review rejected the initial combined operation because generic deployment approval did not explicitly name this secret transfer. That operation did not run.
2. Bind the previously approved local key privately, deploy only the new function from the frozen `backend/` directory with JWT verification enabled, then qualify authenticated hosted status, text, identity rejection and CORS. Native provider synthetic interruption already passed; the deployed browser WebRTC/microphone check follows publication. No production SQL, existing-function replacement, email/WhatsApp or payment work is included.
3. Set repository variable `FARM_VOICE_BACKEND_READY_RELEASE=farm-voice-v1-20261018-rc2` only after that hosted qualification succeeds.
4. Manually run `deploy-web-admin.yml` from the exact release commit/branch, with `release_confirmation=farm-voice-v1-20261018-rc2`. It verifies package/script digests locally and remotely, saves recovery before replacement, uploads assets first, switches index last and checks served Today/Growing hashes.
5. Browser-check deployed Owner Today/Growing, arrow send and chat saving-disabled state using the existing dedicated QA account. Physical microphone/headset acceptance remains a user test; automated native-provider synthetic barge-in already passed locally.

## Recovery

The script creates `$HOME/.sproutify-releases/farm-voice-v1-20261018-rc2-before/admin-before.tar.gz` and `backup.sha256` outside the website, preserves the original index separately and refuses to overwrite this checkpoint. Previous assets remain on the website so the original index can be restored promptly. Offline rehearsal verified full original index/config/content recovery and idempotent redeployment. No database changes are part of this release, so no database rollback is needed for it.

Before restoring, verify the backup hash and exact canonical admin target. Restore the trusted admin archive into that same directory without deleting new assets; verify the original index hash and unchanged public site/config. The new assistant function can remain idle while the old frontend is restored; do not modify unrelated functions or revoke existing keys.

## Evidence and limits

- Full frontend: 464 tests/52 files passed; app/config TypeScript and production build passed; 9 compiled assets checked against the private key with no exposure.
- Hosted handler/shared text/native core: 20 local contract tests passed. Upload/refusal/preservation/rollback: 7 isolated, network-disabled container tests passed.
- Real native model synthetic interruption passed before this packaging. The key was not recreated or rotated.
- The existing frozen farm RC1 and waitlist RC1 archives remain unchanged. This is a separate RC2 release, not the old SQL/account/admin bundle.
- Older backend permission/account/farm-work rollout remains separate. Its capability-gated features continue to fail closed where APIs are absent; this release keeps chat-generated work saving disabled.
- Hosted rate limits are per Edge isolate; they are a coarse authenticated-use bound, not a globally durable quota. No extra infrastructure was provisioned.
- As of preparation, no new secret, Edge deployment or frontend upload has occurred. Production release/hosted acceptance are pending the explicit key-transfer approval.
