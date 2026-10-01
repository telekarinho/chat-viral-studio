-- Conector MCP (Claude/ChatGPT): link secreto por perfil + caixa de entrada de roteiros vindos do assistente.

create extension if not exists pgcrypto with schema extensions;

-- o link é https://<projeto>.supabase.co/functions/v1/mcp/<token>; aqui fica só o hash do token
create table mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index mcp_tokens_ws_user_idx on mcp_tokens(workspace_id, user_id);
alter table mcp_tokens enable row level security;
-- a pessoa vê só os próprios links (sem o token, que nunca é guardado); criar/desligar só pelas funções abaixo
create policy mcp_tokens_select on mcp_tokens for select to authenticated using (user_id = auth.uid());

-- cria um link novo (desliga o anterior deste perfil) e devolve o token UMA vez
create function public.create_mcp_token(p_workspace uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare t text;
begin
  if auth.uid() is null or not public.can_write_workspace(p_workspace) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update mcp_tokens set revoked_at = now() where workspace_id = p_workspace and user_id = auth.uid() and revoked_at is null;
  t := encode(gen_random_bytes(32), 'hex');
  insert into mcp_tokens(workspace_id, user_id, token_hash) values (p_workspace, auth.uid(), encode(digest(t, 'sha256'), 'hex'));
  insert into audit_logs(workspace_id, actor, action, target) values (p_workspace, auth.uid(), 'mcp.token_created', p_workspace::text);
  return t;
end $$;
revoke all on function public.create_mcp_token(uuid) from public, anon;
grant execute on function public.create_mcp_token(uuid) to authenticated;

create function public.revoke_mcp_tokens(p_workspace uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  update mcp_tokens set revoked_at = now() where workspace_id = p_workspace and user_id = auth.uid() and revoked_at is null;
  get diagnostics n = row_count;
  if n > 0 then insert into audit_logs(workspace_id, actor, action, target) values (p_workspace, auth.uid(), 'mcp.token_revoked', p_workspace::text); end if;
  return n;
end $$;
revoke all on function public.revoke_mcp_tokens(uuid) from public, anon;
grant execute on function public.revoke_mcp_tokens(uuid) to authenticated;

-- roteiros escritos pelo assistente: o conector (chave de serviço) grava; o app busca, valida de novo e marca como usado
create table assistant_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_item_id uuid not null references content_items(id) on delete cascade,
  draft jsonb not null,
  source text not null default 'mcp' check (source in ('mcp')),
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
create index assistant_drafts_pending_idx on assistant_drafts(content_item_id, created_at desc) where consumed_at is null;
alter table assistant_drafts enable row level security;
create policy assistant_drafts_select on assistant_drafts for select to authenticated using (public.is_workspace_member(workspace_id));
create policy assistant_drafts_consume on assistant_drafts for update to authenticated
  using (public.can_write_workspace(workspace_id)) with check (public.can_write_workspace(workspace_id));
