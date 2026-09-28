# Architecture V2 — Creator Copilot

## Decision
Use a TypeScript monorepo with a native mobile app, web/admin, API, worker and shared packages.

## Stack
### Mobile
- React Native + TypeScript
- Expo Development Build, not Expo Go
- Expo Router
- react-native-vision-camera for camera capture
- expo-notifications for reminders
- expo-file-system / SQLite for local-first queue and offline metadata
- secure credentials in platform secure storage

### Web/Admin
- Next.js + TypeScript
- Server Components where appropriate
- admin is later; web remains useful for account setup, support and review

### Backend
- NestJS + TypeScript
- PostgreSQL via Supabase
- Supabase Auth
- object storage: S3-compatible abstraction; start with Supabase Storage and allow R2 migration
- Redis + BullMQ for durable async jobs
- OpenAI API for planning, structured scripts, embeddings/memory and transcription
- FFmpeg workers for proxy/render pipeline
- Remotion only for deterministic branded template rendering where it reduces complexity

### Observability
- Sentry for crashes/errors
- PostHog for product analytics
- structured application logs with correlation ids

## Video architecture
Three immutable/derived classes:
1. ORIGINAL — never overwritten.
2. PROXY/PREVIEW — disposable derivative.
3. FINAL EXPORT — deterministic result of project config + source assets.

Capture is local-first. A recording is considered saved only after the OS reports the file persisted locally. Upload happens later and is resumable.

Pipeline:
capture local -> local metadata row -> resumable upload -> object original -> proxy job -> proxy -> edit metadata -> final render job -> export.

No destructive editing. No repeated transcoding of originals.

## AI architecture
All production generation endpoints return validated structured data.
Use JSON Schema/Zod contracts.
Store:
- generation request metadata
- prompt version
- model identifier
- structured response
- user edits
- duplicate similarity signals

Memory retrieval must be workspace-scoped.

## Multi-tenancy
Every business table is workspace-scoped.
RLS is mandatory in Supabase.
User may belong to multiple workspaces later.

## Security
- no API keys in mobile bundle
- service-role credentials only server-side
- signed upload/download URLs
- least privilege
- audit log for destructive/privacy-sensitive actions
- export/delete account flows designed from day one
- retention policy documented by media class

## Social integrations
Phase 4 only. Use official APIs.
TikTok Direct Post requires platform review/audit for public posting.
YouTube upload uses official Data API and project compliance rules.
Meta publishing must follow current Graph API capability and account requirements.

## Repository target layout
apps/
  mobile/
  web/
  api/
  worker/
packages/
  domain/
  ai-contracts/
  ui/
  config/
  database/
supabase/
  migrations/
  seed.sql
docs/
