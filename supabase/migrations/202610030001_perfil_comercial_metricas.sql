-- Perfil comercial: casos reais de clientes e provas filmáveis (item 4 dos ajustes pós-teste).
-- Sem caso real AUTORIZADO, o diretor não escreve "Histórias de cliente" (nunca inventa depoimento).
-- Escrita pelo conector (chave de serviço); quem é do perfil lê.

create table if not exists casos_reais (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  cliente_segmento text not null check (length(cliente_segmento) between 2 and 160),
  problema text not null check (length(problema) between 3 and 1000),
  resultado text not null check (length(resultado) between 3 and 1000),
  -- quem autorizou e como (ex.: "WhatsApp do dono em 02/10"); vazio = sem autorização
  autorizacao text not null default '' check (length(autorizacao) <= 300),
  midia_disponivel text not null default '' check (length(midia_disponivel) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists casos_reais_ws_idx on casos_reais(workspace_id, created_at desc);
alter table casos_reais enable row level security;
drop policy if exists casos_reais_select on casos_reais;
create policy casos_reais_select on casos_reais for select to authenticated using (public.is_workspace_member(workspace_id));

create table if not exists provas_filmaveis (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  descricao text not null check (length(descricao) between 3 and 300),
  status text not null default 'falta_filmar' check (status in ('falta_filmar', 'filmada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, descricao)
);
alter table provas_filmaveis enable row level security;
drop policy if exists provas_filmaveis_select on provas_filmaveis;
create policy provas_filmaveis_select on provas_filmaveis for select to authenticated using (public.is_workspace_member(workspace_id));

-- Números de post importados pelo assistente (ex.: lidos no Metricool) — item 5. O app junta com os digitados.
create table if not exists post_metrics (
  content_item_id uuid primary key references content_items(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  metrics jsonb not null,
  source text not null default 'assistente' check (length(source) <= 60),
  updated_at timestamptz not null default now()
);
create index if not exists post_metrics_ws_idx on post_metrics(workspace_id, updated_at desc);
alter table post_metrics enable row level security;
drop policy if exists post_metrics_select on post_metrics;
create policy post_metrics_select on post_metrics for select to authenticated using (public.is_workspace_member(workspace_id));
