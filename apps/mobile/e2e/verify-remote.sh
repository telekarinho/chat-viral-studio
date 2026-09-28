#!/usr/bin/env bash
# Downloads every synced original and checks md5 == checksum computed on the device before upload.
set -euo pipefail
rows=$(psql "$DB_URL" -tA -F' ' -c "select id, storage_key, checksum, size_bytes from media_files where state='uploaded_original' and remote_verified_at is not null")
test -n "$rows" || { echo "FAIL: no verified media_files row on the server"; exit 1; }
while read -r id key checksum size; do
  curl -sf -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" "$SUPABASE_URL/storage/v1/object/takes/$key" -o /tmp/remote.mp4
  got=$(md5sum /tmp/remote.mp4 | cut -d' ' -f1)
  bytes=$(stat -c %s /tmp/remote.mp4)
  echo "media $id: device md5=$checksum remote md5=$got size device=$size remote=$bytes"
  [ "$got" = "$checksum" ] && [ "$bytes" = "$size" ] || { echo "FAIL: integrity mismatch"; exit 1; }
done <<< "$rows"
takes=$(psql "$DB_URL" -tAc "select count(*) from takes t join recording_tasks r on r.id=t.recording_task_id where r.status='done'")
echo "takes attached to done tasks on server: $takes"
test "$takes" -ge 1
echo "REMOTE INTEGRITY OK"
