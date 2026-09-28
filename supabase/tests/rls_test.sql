-- RLS cross-tenant test. Run as a superuser/postgres; exits non-zero on the first failure.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@test.local'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b@test.local');

create temp table ctx(k text primary key, v uuid);
grant all on ctx to authenticated;

-- user A onboarding
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into ctx values ('wsA', public.bootstrap_workspace('A', '{"displayName":"A","signature":"A.me","closingPhrase":"E se der certo!"}',
  '[{"slug":"reflexao","name":"Reflexão","targetPercent":100}]', '[{"weekday":1,"startTime":"10:30","title":"Pensamento","format":"thought"}]'));
-- idempotent onboarding
do $$ begin
  if public.bootstrap_workspace('A2','{}','[]','[]') <> (select v from ctx where k='wsA') then raise exception 'bootstrap not idempotent'; end if;
end $$;
insert into content_items(id, workspace_id, format, title) select 'cccccccc-0000-4000-8000-00000000000a', v, 'thought', 'Roteiro A' from ctx where k='wsA';
insert into recording_tasks(id, workspace_id, scheduled_for, title, kind) select 'dddddddd-0000-4000-8000-00000000000a', v, now(), 'Tarefa A', 'thought' from ctx where k='wsA';
insert into scripts(workspace_id, content_item_id, prompt_version, model, script) select v, 'cccccccc-0000-4000-8000-00000000000a', 'v1', 'local', 'texto A' from ctx where k='wsA';
insert into media_files(id, workspace_id, class, size_bytes, checksum) select 'eeeeeeee-0000-4000-8000-00000000000a', v, 'original', 10, 'x' from ctx where k='wsA';
insert into takes(workspace_id, media_file_id) select v, 'eeeeeeee-0000-4000-8000-00000000000a' from ctx where k='wsA';
insert into storage.objects(bucket_id, name) select 'takes', v || '/take-a.mp4' from ctx where k='wsA';

-- user B
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
insert into ctx values ('wsB', public.bootstrap_workspace('B', '{"displayName":"B"}', '[{"slug":"humor","name":"Humor","targetPercent":100}]', '[]'));

do $$
declare n int; wsA uuid := (select v from ctx where k='wsA');
begin
  select count(*) into n from workspaces; if n <> 1 then raise exception 'B sees % workspaces', n; end if;
  select count(*) into n from content_items; if n <> 0 then raise exception 'B sees A content_items'; end if;
  select count(*) into n from scripts; if n <> 0 then raise exception 'B sees A scripts'; end if;
  select count(*) into n from recording_tasks; if n <> 0 then raise exception 'B sees A tasks'; end if;
  select count(*) into n from takes; if n <> 0 then raise exception 'B sees A takes'; end if;
  select count(*) into n from media_files; if n <> 0 then raise exception 'B sees A media'; end if;
  select count(*) into n from storage.objects; if n <> 0 then raise exception 'B sees A storage objects'; end if;
  select count(*) into n from content_pillars; if n <> 1 then raise exception 'B sees foreign pillars'; end if;
  update recording_tasks set title = 'hacked' where workspace_id = wsA; get diagnostics n = row_count;
  if n <> 0 then raise exception 'B updated A tasks'; end if;
  delete from content_items where workspace_id = wsA; get diagnostics n = row_count;
  if n <> 0 then raise exception 'B deleted A content'; end if;
  begin
    insert into recording_tasks(workspace_id, scheduled_for, title, kind) values (wsA, now(), 'x', 'broll');
    raise exception 'B inserted into A workspace';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects(bucket_id, name) values ('takes', wsA || '/evil.mp4');
    raise exception 'B uploaded into A folder';
  exception when insufficient_privilege then null; end;
  begin
    insert into workspace_members(workspace_id, user_id, role) values (wsA, auth.uid(), 'owner');
    raise exception 'B joined A workspace';
  exception when insufficient_privilege then null; end;
  if (public.export_my_data()->'content_items') <> '[]'::jsonb then raise exception 'export leaked A data'; end if;
  begin
    perform public.write_audit(wsA, 'forged', null);
    raise exception 'B forged audit in A workspace';
  exception when insufficient_privilege then null; end;
end $$;

-- anon sees nothing
reset role;
set local role anon;
do $$ begin
  perform 1 from content_items;
  raise exception 'anon can read content_items';
exception when insufficient_privilege then null; end $$;

-- A still sees own data, and pillar sum is enforced
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$ declare n int; begin
  select count(*) into n from recording_tasks where title = 'Tarefa A'; if n <> 1 then raise exception 'A lost own task'; end if;
  select count(*) into n from storage.objects; if n <> 1 then raise exception 'A cannot see own object'; end if;
end $$;
savepoint s1;
update content_pillars set target_percent = 50;
do $$ begin
  set constraints all immediate;
  raise exception 'pillar sum not enforced';
exception when check_violation then null; end $$;
rollback to savepoint s1;
-- owner A cannot force-add B into A's workspace (would hijack B's onboarding)
do $$ begin
  insert into workspace_members(workspace_id, user_id, role) select v, 'bbbbbbbb-0000-4000-8000-000000000002', 'owner' from ctx where k='wsA';
  raise exception 'owner added another user without consent';
exception when insufficient_privilege then null; end $$;
-- A cannot overwrite an existing original object
do $$ declare n int; begin
  update storage.objects set name = name where bucket_id = 'takes'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'storage original overwritable'; end if;
end $$;
-- render queue: A can request; B can't see it; nobody but the worker can mark it done
insert into render_jobs(workspace_id, content_item_id, plan) select v, 'cccccccc-0000-4000-8000-00000000000a', '{}' from ctx where k='wsA';
do $$ begin
  insert into render_jobs(workspace_id, content_item_id, plan, status) select v, 'cccccccc-0000-4000-8000-00000000000a', '{}', 'done' from ctx where k='wsA';
  raise exception 'client created a done render job';
exception when insufficient_privilege or check_violation then null; end $$;
do $$ begin
  update render_jobs set status = 'done';
  raise exception 'client updated render job';
exception when insufficient_privilege then null; end $$;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$ declare n int; begin
  select count(*) into n from render_jobs; if n <> 0 then raise exception 'B sees A render jobs'; end if;
end $$;
select 'RLS OK: user B cannot read/write user A data, anon blocked, pillar sum enforced' as result;
rollback;
