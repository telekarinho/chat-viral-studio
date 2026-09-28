# Video Pipeline

## Capture guarantees
- record directly to local app storage
- close file atomically before any upload attempt
- create local DB record with checksum and state
- never make network availability a prerequisite for capture
- background sync is best-effort; foreground resume must always work

## Asset states
local_only -> queued -> uploading -> uploaded_original -> proxy_ready -> renderable -> archived

## Derived assets
- proxy: lower bitrate/resolution, edit preview only
- thumbnail/frame extracts
- waveform
- transcript
- final exports

## Retry
All network/media jobs are idempotent.
Use attempt counter + exponential backoff + dead-letter state.
Never delete local original until remote integrity is confirmed and retention rule permits cleanup.

## Rendering
Phase 2:
- FFmpeg worker
- cuts from time ranges
- loudness normalization
- optional denoise
- subtitles from reviewed transcript
- safe-zone positioning
- title/signature overlays
- 9:16 output

Phase 3:
- manual timeline
- B-roll layering
- cover composition
- advanced transitions
