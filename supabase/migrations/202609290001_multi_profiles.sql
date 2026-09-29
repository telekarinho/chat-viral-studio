-- Several profiles per account (personal, company, product line). Each profile is its own workspace, isolated by RLS.
-- Kind + sales strategy of a business profile live in creator_profiles.tone ({"kind":"empresa","business":{...}}).

create function public.create_profile(p_id uuid, p_name text, p_profile jsonb, p_pillars jsonb, p_blocks jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  rt uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if exists (select 1 from workspaces w where w.id = p_id) then
    -- idempotent retry after network loss; never hands out someone else's workspace
    if exists (select 1 from workspaces w where w.id = p_id and w.created_by = uid) then return p_id; end if;
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if (select count(*) from workspaces w where w.created_by = uid and w.deleted_at is null) >= 10 then
    raise exception 'limite de 10 perfis' using errcode = '54000';
  end if;
  if coalesce(p_profile->'tone'->>'kind', 'pessoal') not in ('pessoal', 'empresa') then
    raise exception 'tipo de perfil inválido' using errcode = '22023';
  end if;

  insert into workspaces(id, name, slug, created_by) values (p_id, p_name, 'ws-' || replace(gen_random_uuid()::text, '-', ''), uid);
  insert into workspace_members(workspace_id, user_id, role) values (p_id, uid, 'owner');
  insert into creator_profiles(workspace_id, display_name, handle, positioning, signature, closing_phrase, voice_rules, tone)
  values (p_id, coalesce(p_profile->>'displayName', p_name), p_profile->>'handle', p_profile->>'positioning', p_profile->>'signature', p_profile->>'closingPhrase',
          coalesce(array(select jsonb_array_elements_text(p_profile->'voiceRules')), '{}'), coalesce(p_profile->'tone', '{}'::jsonb));
  insert into content_pillars(workspace_id, name, slug, target_percent)
  select p_id, p->>'name', p->>'slug', (p->>'targetPercent')::numeric from jsonb_array_elements(p_pillars) p;
  insert into routines(workspace_id, name) values (p_id, 'Rotina padrão') returning id into rt;
  insert into routine_blocks(workspace_id, routine_id, weekday, start_time, title, content_hint, optional, default_format)
  select p_id, rt, (b->>'weekday')::smallint, (b->>'startTime')::time, b->>'title', b->>'contentHint', coalesce((b->>'optional')::boolean, false), (b->>'format')::content_format
  from jsonb_array_elements(p_blocks) b;
  insert into audit_logs(workspace_id, actor, action) values (p_id, uid, 'workspace.create_profile');
  return p_id;
end $$;
revoke all on function public.create_profile(uuid, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_profile(uuid, text, jsonb, jsonb, jsonb) to authenticated;

-- onboarding keeps its idempotency (first profile) and now also stores the kind/strategy
create or replace function public.bootstrap_workspace(p_name text, p_profile jsonb, p_pillars jsonb, p_blocks jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select w.id into ws from workspaces w where w.created_by = auth.uid() and w.deleted_at is null order by w.created_at limit 1;
  if ws is not null then return ws; end if;
  return public.create_profile(gen_random_uuid(), p_name, p_profile, p_pillars, p_blocks);
end $$;
revoke all on function public.bootstrap_workspace(text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.bootstrap_workspace(text, jsonb, jsonb, jsonb) to authenticated;
