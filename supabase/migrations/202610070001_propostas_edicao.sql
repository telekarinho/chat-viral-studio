-- Proposta de edição do diretor (Claude pelo conector): estilo AutoCut, música, volume e trecho, com o motivo.
-- Nada monta sozinho: o criador escolhe no app MONTAR ASSIM (aplica e monta), AJUSTAR (aplica e mexe) ou dispensa.
create table if not exists propostas_edicao (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_item_id uuid not null references content_items(id) on delete cascade,
  edit jsonb not null,
  motivo text not null default '' check (length(motivo) <= 600),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decisao text check (decisao in ('montar', 'ajustar', 'dispensar'))
);
create index if not exists propostas_edicao_pending_idx on propostas_edicao(content_item_id, created_at desc) where decided_at is null;
alter table propostas_edicao enable row level security;
drop policy if exists propostas_edicao_select on propostas_edicao;
create policy propostas_edicao_select on propostas_edicao for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists propostas_edicao_decide on propostas_edicao;
create policy propostas_edicao_decide on propostas_edicao for update to authenticated
  using (public.can_write_workspace(workspace_id)) with check (public.can_write_workspace(workspace_id));
