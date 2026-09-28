-- Post.ai — real tenant isolation. Enabling RLS alone denies everything; these policies grant
-- access strictly by workspace membership. Tested by apps/api/test/rls.integration.test.ts.

create function public.is_workspace_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members m where m.workspace_id = ws and m.user_id = auth.uid());
$$;

create function public.can_write_workspace(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members m where m.workspace_id = ws and m.user_id = auth.uid() and m.role in ('owner','editor'));
$$;

create function public.is_workspace_owner(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members m where m.workspace_id = ws and m.user_id = auth.uid() and m.role = 'owner');
$$;

revoke all on function public.is_workspace_member(uuid), public.can_write_workspace(uuid), public.is_workspace_owner(uuid) from public;
grant execute on function public.is_workspace_member(uuid), public.can_write_workspace(uuid), public.is_workspace_owner(uuid) to authenticated;

-- enable RLS everywhere
do $$
declare t text;
begin
  foreach t in array array['workspaces','workspace_members','creator_profiles','content_pillars','routines','routine_blocks','content_items',
    'recording_tasks','task_events','scripts','media_files','takes','ai_memories','content_fingerprints','generation_runs','audit_logs','privacy_requests']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- tenant tables: members read, owner/editor write
do $$
declare t text;
begin
  foreach t in array array['creator_profiles','content_pillars','routines','routine_blocks','content_items','recording_tasks','task_events',
    'scripts','media_files','takes','ai_memories','content_fingerprints','generation_runs']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_workspace_member(workspace_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_write_workspace(workspace_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_write_workspace(workspace_id)) with check (public.can_write_workspace(workspace_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_write_workspace(workspace_id))', t || '_delete', t);
  end loop;
end $$;

-- task history and generation logs are append-only for clients
drop policy task_events_update on task_events;
drop policy task_events_delete on task_events;
drop policy generation_runs_update on generation_runs;
drop policy generation_runs_delete on generation_runs;

create policy workspaces_select on workspaces for select to authenticated using (public.is_workspace_member(id));
create policy workspaces_update on workspaces for update to authenticated using (public.is_workspace_owner(id)) with check (public.is_workspace_owner(id));
-- no insert/delete policy: creation goes through bootstrap_workspace(), deletion through privacy workflow

create policy members_select on workspace_members for select to authenticated using (user_id = auth.uid() or public.is_workspace_member(workspace_id));
-- no insert policy: adding someone else requires a consent-based invite flow (post-MVP); owners may only manage existing rows
create policy members_owner_update on workspace_members for update to authenticated using (public.is_workspace_owner(workspace_id)) with check (public.is_workspace_owner(workspace_id));
create policy members_owner_delete on workspace_members for delete to authenticated using (public.is_workspace_owner(workspace_id));

create policy audit_select on audit_logs for select to authenticated using (actor = auth.uid() or (workspace_id is not null and public.is_workspace_owner(workspace_id)));

create policy privacy_select on privacy_requests for select to authenticated using (user_id = auth.uid());
create policy privacy_insert on privacy_requests for insert to authenticated with check (user_id = auth.uid() and status = 'requested');

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

-- onboarding: creates a workspace owned by the caller, seeded with profile, pillars and routine
create function public.bootstrap_workspace(p_name text, p_profile jsonb, p_pillars jsonb, p_blocks jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  ws uuid;
  rt uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select w.id into ws from workspaces w where w.created_by = uid and w.deleted_at is null order by w.created_at limit 1;
  if ws is not null then return ws; end if; -- idempotent: onboarding retried after network loss

  insert into workspaces(name, slug, created_by) values (p_name, 'ws-' || replace(gen_random_uuid()::text, '-', ''), uid) returning id into ws;
  insert into workspace_members(workspace_id, user_id, role) values (ws, uid, 'owner');
  insert into creator_profiles(workspace_id, display_name, handle, positioning, signature, closing_phrase, voice_rules)
  values (ws, coalesce(p_profile->>'displayName', p_name), p_profile->>'handle', p_profile->>'positioning', p_profile->>'signature', p_profile->>'closingPhrase',
          coalesce(array(select jsonb_array_elements_text(p_profile->'voiceRules')), '{}'));
  insert into content_pillars(workspace_id, name, slug, target_percent)
  select ws, p->>'name', p->>'slug', (p->>'targetPercent')::numeric from jsonb_array_elements(p_pillars) p;
  insert into routines(workspace_id, name) values (ws, 'Rotina padrão') returning id into rt;
  insert into routine_blocks(workspace_id, routine_id, weekday, start_time, title, content_hint, optional, default_format)
  select ws, rt, (b->>'weekday')::smallint, (b->>'startTime')::time, b->>'title', b->>'contentHint', coalesce((b->>'optional')::boolean, false), (b->>'format')::content_format
  from jsonb_array_elements(p_blocks) b;
  insert into audit_logs(workspace_id, actor, action) values (ws, uid, 'workspace.bootstrap');
  return ws;
end $$;
revoke all on function public.bootstrap_workspace(text, jsonb, jsonb, jsonb) from public;
grant execute on function public.bootstrap_workspace(text, jsonb, jsonb, jsonb) to authenticated;

-- LGPD: export runs as the caller, so RLS limits it to their own workspaces
create function public.export_my_data() returns jsonb language plpgsql security invoker set search_path = public as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'exported_at', now(),
    'workspaces', (select coalesce(jsonb_agg(w), '[]') from workspaces w),
    'profiles', (select coalesce(jsonb_agg(p), '[]') from creator_profiles p),
    'pillars', (select coalesce(jsonb_agg(p), '[]') from content_pillars p),
    'routine_blocks', (select coalesce(jsonb_agg(b), '[]') from routine_blocks b),
    'content_items', (select coalesce(jsonb_agg(c), '[]') from content_items c),
    'scripts', (select coalesce(jsonb_agg(s), '[]') from scripts s),
    'recording_tasks', (select coalesce(jsonb_agg(t), '[]') from recording_tasks t),
    'task_events', (select coalesce(jsonb_agg(e), '[]') from task_events e),
    'takes', (select coalesce(jsonb_agg(t), '[]') from takes t),
    'media_files', (select coalesce(jsonb_agg(m), '[]') from media_files m),
    'content_fingerprints', (select coalesce(jsonb_agg(f), '[]') from content_fingerprints f),
    'ai_memories', (select coalesce(jsonb_agg(a), '[]') from ai_memories a),
    'generation_runs', (select coalesce(jsonb_agg(g), '[]') from generation_runs g),
    'audit_logs', (select coalesce(jsonb_agg(l), '[]') from audit_logs l),
    'privacy_requests', (select coalesce(jsonb_agg(r), '[]') from privacy_requests r)
  ) into result;
  perform public.write_audit(null, 'privacy.export', null);
  return result;
end $$;

create function public.write_audit(p_ws uuid, p_action text, p_target text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or (p_ws is not null and not public.is_workspace_member(p_ws)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into audit_logs(workspace_id, actor, action, target) values (p_ws, auth.uid(), left(p_action, 80), left(p_target, 200));
end $$;
revoke all on function public.write_audit(uuid, text, text) from public;
grant execute on function public.write_audit(uuid, text, text) to authenticated;
grant execute on function public.export_my_data() to authenticated;

-- LGPD: deletion request; the privileged erasure worker (service role) processes it and removes media
create function public.request_account_deletion() returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  insert into privacy_requests(user_id, kind) values (auth.uid(), 'delete_account') returning id into rid;
  insert into audit_logs(actor, action, target) values (auth.uid(), 'privacy.delete_requested', rid::text);
  return rid;
end $$;
revoke all on function public.request_account_deletion() from public;
grant execute on function public.request_account_deletion() to authenticated;

-- storage: private bucket, object path = <workspace_id>/<take_id>.mp4
insert into storage.buckets (id, name, public) values ('takes', 'takes', false) on conflict (id) do nothing;

create function public.path_workspace(p_name text) returns uuid language plpgsql immutable as $$
begin
  return (split_part(p_name, '/', 1))::uuid;
exception when others then
  return null;
end $$;

create policy takes_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'takes' and public.is_workspace_member(public.path_workspace(name)));
create policy takes_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'takes' and public.can_write_workspace(public.path_workspace(name)));
-- no update policy: verified originals are immutable in Storage too (upload uses upsert=false)
create policy takes_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'takes' and public.is_workspace_owner(public.path_workspace(name)));

-- Supabase grants EXECUTE to anon by default; none of these are for anonymous callers
revoke execute on function public.bootstrap_workspace(text, jsonb, jsonb, jsonb), public.export_my_data(), public.write_audit(uuid, text, text),
  public.request_account_deletion(), public.is_workspace_member(uuid), public.can_write_workspace(uuid), public.is_workspace_owner(uuid) from anon;
