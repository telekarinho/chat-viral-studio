create extension if not exists pgcrypto;

create type task_status as enum ('pending','done','skipped','did_not_happen','rescheduled','alternate_scene');
create type content_format as enum ('thought','main_video','story','broll');

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists creator_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  display_name text not null,
  handle text,
  positioning text,
  signature text,
  closing_phrase text,
  tone jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists content_pillars (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  target_percent numeric(5,2) not null check (target_percent >= 0 and target_percent <= 100),
  active boolean not null default true,
  unique(workspace_id, slug)
);

create table if not exists routines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  timezone text not null default 'America/Sao_Paulo',
  active boolean not null default true
);

create table if not exists routine_blocks (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references routines(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  title text not null,
  content_hint text,
  optional boolean not null default false,
  default_format content_format
);

create table if not exists content_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  pillar_id uuid references content_pillars(id),
  scheduled_for timestamptz,
  format content_format not null,
  title text not null,
  duration_seconds integer,
  status text not null default 'planned',
  structured_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists recording_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_item_id uuid references content_items(id) on delete set null,
  scheduled_for timestamptz not null,
  title text not null,
  kind text not null,
  suggested_duration_seconds integer,
  status task_status not null default 'pending',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists scripts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_item_id uuid not null references content_items(id) on delete cascade,
  prompt_version text not null,
  model text not null,
  hook_options jsonb not null default '[]'::jsonb,
  script text not null,
  narrative jsonb not null default '{}'::jsonb,
  screen_text text,
  cta text,
  created_at timestamptz not null default now()
);

create table if not exists media_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  storage_key text,
  local_uri text,
  class text not null check (class in ('original','proxy','final')),
  state text not null,
  mime_type text,
  size_bytes bigint,
  checksum text,
  created_at timestamptz not null default now()
);

create table if not exists takes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  recording_task_id uuid references recording_tasks(id) on delete set null,
  media_file_id uuid not null references media_files(id) on delete cascade,
  category text,
  tags text[] not null default '{}',
  reusable boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists ai_memories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  memory_type text not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists content_fingerprints (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_item_id uuid references content_items(id) on delete cascade,
  fingerprint_type text not null,
  fingerprint text not null,
  created_at timestamptz not null default now()
);

alter table workspaces enable row level security;
alter table creator_profiles enable row level security;
alter table content_pillars enable row level security;
alter table routines enable row level security;
alter table routine_blocks enable row level security;
alter table content_items enable row level security;
alter table recording_tasks enable row level security;
alter table scripts enable row level security;
alter table media_files enable row level security;
alter table takes enable row level security;
alter table ai_memories enable row level security;
alter table content_fingerprints enable row level security;
