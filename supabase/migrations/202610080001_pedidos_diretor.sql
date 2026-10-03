-- Pedidos do criador ao Diretor (Claude) sobre um vídeo: "quero mais rápido", "troca o começo"...
-- O app grava o pedido; o Claude lê pelo conector (pedidos_do_criador), age (propor_edicao, salvar_roteiro…)
-- e responde (responder_pedido). A resposta só é escrita pelo conector (chave de serviço).
create table if not exists pedidos_diretor (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_item_id uuid not null references content_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  texto text not null check (length(texto) between 2 and 600),
  resposta text check (length(resposta) <= 2000),
  created_at timestamptz not null default now(),
  respondido_at timestamptz
);
create index if not exists pedidos_diretor_content_idx on pedidos_diretor(content_item_id, created_at desc);
create index if not exists pedidos_diretor_pending_idx on pedidos_diretor(workspace_id, created_at desc) where respondido_at is null;
alter table pedidos_diretor enable row level security;
drop policy if exists pedidos_diretor_select on pedidos_diretor;
create policy pedidos_diretor_select on pedidos_diretor for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists pedidos_diretor_insert on pedidos_diretor;
create policy pedidos_diretor_insert on pedidos_diretor for insert to authenticated
  with check (user_id = auth.uid() and public.can_write_workspace(workspace_id));
