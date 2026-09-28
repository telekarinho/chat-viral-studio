-- Gravação por partes: each take may be one part (0-based) of the script of its content item.
alter table takes add column segment_index smallint check (segment_index between 0 and 30);
create index takes_content_segment_idx on takes(content_item_id, segment_index);
-- automatic edit plan (edit-v1) chosen for a content item; rendered by the FFmpeg worker
alter table content_items add column edit_plan jsonb;

-- Final render queue (worker with FFmpeg, service role). Clients can request and read, never update.
create table render_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_item_id uuid not null references content_items(id) on delete cascade,
  plan jsonb not null,
  status text not null default 'queued' check (status in ('queued','rendering','done','failed')),
  attempts smallint not null default 0,
  output_key text,
  output_size bigint,
  error text,
  requested_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index render_jobs_queue_idx on render_jobs(status, created_at);
alter table render_jobs enable row level security;
revoke all on render_jobs from anon;
revoke all on render_jobs from authenticated; -- Supabase default privileges grant ALL on new tables
grant select, insert on render_jobs to authenticated;
create policy render_jobs_select on render_jobs for select to authenticated using (public.is_workspace_member(workspace_id));
create policy render_jobs_insert on render_jobs for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and status = 'queued' and attempts = 0 and output_key is null);

-- worker: atomically claim the oldest queued job (service role only)
create function public.claim_render_job() returns render_jobs language sql security definer set search_path = public as $$
  update render_jobs set status = 'rendering', attempts = attempts + 1, updated_at = now()
  where id = (select id from render_jobs where status = 'queued' and attempts < 3 order by created_at for update skip locked limit 1)
  returning *;
$$;
revoke all on function public.claim_render_job() from public, anon, authenticated;
grant execute on function public.claim_render_job() to service_role;
