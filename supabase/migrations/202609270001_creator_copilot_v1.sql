-- Post.ai — schema v1. Every tenant row carries workspace_id; RLS policies live in 202609270002.
-- Primary keys are client-generated uuids so the offline-first app can upsert idempotently.
create extension if not exists pgcrypto;

create type task_status as enum ('pending','done','skipped','did_not_happen','rescheduled','alternate_scene');
create type content_format as enum ('thought','main_video','story','broll');
create type workspace_role as enum ('owner','editor','viewer');
create type media_state as enum ('local_only','queued','uploading','uploaded_original','dead_letter','proxy_ready','renderable','archived');

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  slug text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role workspace_role not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on workspace_members(user_id);

create table creator_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references workspaces(id) on delete cascade,
  display_name text not null,
  handle text,
  positioning text,
  signature text,
  closing_phrase text,
  tone jsonb not null default '{}'::jsonb,
  voice_rules text[] not null default '{}',
  ai_training_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table content_pillars (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  target_percent numeric(5,2) not null check (target_percent >= 0 and target_percent <= 100),
  active boolean not null default true,
  unique(workspace_id, slug)
);

-- active pillar targets must sum to 100 at commit time (deferred so a full update in one tx works)
create function check_pillar_sum() returns trigger language plpgsql as $$
declare ws uuid := coalesce(new.workspace_id, old.workspace_id); total numeric;
begin
  select coalesce(sum(target_percent),0) into total from content_pillars where workspace_id = ws and active;
  if exists (select 1 from content_pillars where workspace_id = ws and active) and abs(total - 100) > 0.01 then
    raise exception 'pillar targets must sum to 100 (got %)', total using errcode = 'check_violation';
  end if;
  return null;
end $$;
create constraint trigger content_pillars_sum after insert or update or delete on content_pillars
  deferrable initially deferred for each row execute function check_pillar_sum();

create table routines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  timezone text not null default 'America/Sao_Paulo',
  active boolean not null default true
);

create table routine_blocks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  routine_id uuid not null references routines(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  title text not null,
  content_hint text,
  optional boolean not null default false,
  default_format content_format not null default 'broll',
  reminder boolean not null default true
);

create table content_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  pillar_slug text,
  plan_date date,
  scheduled_for timestamptz,
  format content_format not null,
  title text not null,
  duration_seconds integer,
  status text not null default 'planned' check (status in ('planned','scripted','recorded','published','done')),
  structured_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index content_items_ws_date_idx on content_items(workspace_id, plan_date);

create table recording_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_item_id uuid references content_items(id) on delete set null,
  scheduled_for timestamptz not null,
  title text not null,
  kind content_format not null,
  hint text,
  suggested_duration_seconds integer,
  optional boolean not null default false,
  status task_status not null default 'pending',
  notes text,
  take_id uuid,
  superseded_by uuid references recording_tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recording_tasks_ws_time_idx on recording_tasks(workspace_id, scheduled_for);

create table task_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  task_id uuid not null references recording_tasks(id) on delete cascade,
  action text not null,
  from_status task_status not null,
  to_status task_status not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table scripts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_item_id uuid not null references content_items(id) on delete cascade,
  prompt_version text not null,
  model text not null,
  source text not null default 'openai' check (source in ('openai','local','manual')),
  hook_options jsonb not null default '[]'::jsonb,
  selected_hook smallint,
  script text not null,
  narrative jsonb not null default '{}'::jsonb,
  screen_text text,
  cta text,
  draft jsonb not null default '{}'::jsonb,
  user_edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table media_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  storage_key text,
  class text not null check (class in ('original','proxy','final')),
  state media_state not null default 'local_only',
  mime_type text,
  size_bytes bigint check (size_bytes >= 0),
  checksum text,
  width integer,
  height integer,
  duration_ms integer,
  remote_verified_at timestamptz,
  created_at timestamptz not null default now()
);

-- originals are immutable once ingest is verified (only state progression allowed)
create function guard_original_immutable() returns trigger language plpgsql as $$
begin
  if old.class = 'original' and old.remote_verified_at is not null and
     (new.checksum is distinct from old.checksum or new.size_bytes is distinct from old.size_bytes or new.storage_key is distinct from old.storage_key) then
    raise exception 'original media is immutable after verified ingest';
  end if;
  return new;
end $$;
create trigger media_files_immutable before update on media_files for each row execute function guard_original_immutable();

create table takes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  recording_task_id uuid references recording_tasks(id) on delete set null,
  content_item_id uuid references content_items(id) on delete set null,
  media_file_id uuid not null references media_files(id) on delete cascade,
  category text,
  tags text[] not null default '{}',
  camera text check (camera in ('front','back')),
  reusable boolean not null default true,
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table ai_memories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  memory_type text not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table content_fingerprints (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_item_id uuid references content_items(id) on delete cascade,
  fingerprint_type text not null check (fingerprint_type in ('topic','phrase','metaphor','hook','cta','structure')),
  fingerprint text not null,
  created_at timestamptz not null default now()
);
create index content_fingerprints_ws_idx on content_fingerprints(workspace_id, created_at desc);

create table generation_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_item_id uuid references content_items(id) on delete set null,
  source text not null,
  model text not null,
  prompt_version text not null,
  request jsonb not null default '{}'::jsonb,
  response jsonb,
  accepted boolean not null,
  rejection_reason text,
  repetition jsonb not null default '{}'::jsonb,
  latency_ms integer,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id bigint generated always as identity primary key,
  workspace_id uuid references workspaces(id) on delete set null,
  actor uuid references auth.users(id) on delete set null,
  action text not null,
  target text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table privacy_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('export','delete_account')),
  status text not null default 'requested' check (status in ('requested','processing','done','rejected')),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
