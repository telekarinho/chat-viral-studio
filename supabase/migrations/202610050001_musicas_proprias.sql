-- Música própria do criador (enviada pelo app): arquivo no bucket "takes" em <workspace>/music/<id>.<ext>.
-- O criador declara a licença ao enviar; perfil de empresa só usa faixa com licença comercial declarada.
create table if not exists musicas_proprias (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  storage_key text not null check (storage_key like workspace_id::text || '/music/%'),
  titulo text not null check (length(titulo) between 1 and 120),
  -- declaração do criador: "minha" | "licenciada" (ex.: Biblioteca de Áudio do YouTube) + se vale para uso comercial
  origem text not null check (origem in ('minha', 'licenciada')),
  comercial boolean not null default false,
  duracao_segundos numeric,
  declarado_por uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists musicas_proprias_ws_idx on musicas_proprias(workspace_id, created_at desc);
alter table musicas_proprias enable row level security;
drop policy if exists musicas_proprias_select on musicas_proprias;
create policy musicas_proprias_select on musicas_proprias for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists musicas_proprias_insert on musicas_proprias;
create policy musicas_proprias_insert on musicas_proprias for insert to authenticated with check (public.can_write_workspace(workspace_id));
drop policy if exists musicas_proprias_delete on musicas_proprias;
create policy musicas_proprias_delete on musicas_proprias for delete to authenticated using (public.can_write_workspace(workspace_id));
