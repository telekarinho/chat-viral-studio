-- Diretor de gravações (fase 1): melhorias que o Claude registra pelo conector viram itens do backlog do dev.
-- O worker (GitHub Actions) copia as novas para issues do repositório e devolve o status.

create table melhorias (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  titulo text not null check (length(titulo) between 3 and 140),
  descricao text not null check (length(descricao) between 3 and 4000),
  prioridade text not null default 'media' check (prioridade in ('baixa', 'media', 'alta')),
  status text not null default 'nova' check (status in ('nova', 'no_backlog', 'feita', 'recusada')),
  issue_number integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index melhorias_status_idx on melhorias(status, created_at);
alter table melhorias enable row level security;
-- quem é do perfil vê o que foi pedido e o andamento; criar/atualizar só pelo conector/worker (chave de serviço)
create policy melhorias_select on melhorias for select to authenticated using (workspace_id is not null and public.is_workspace_member(workspace_id));
