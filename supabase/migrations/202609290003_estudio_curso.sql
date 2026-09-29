-- Estúdio da fábrica + Curso de Milk Shake: metadados de clipe, peças derivadas com origem,
-- aulas do curso e espelho SOMENTE LEITURA do catálogo MMIX (sem preço; nada de segundo cadastro).

-- each take keeps its origin: mode/project/lesson, product+SKU, ice-cream source, recipe, notes, permissions, review
alter table takes add column if not exists meta jsonb not null default '{}'::jsonb;

-- a derived piece (lesson, short, marketplace, support...) points to the recording it came from;
-- fixing a claim/SKU/recipe/image right on the origin flags every derived piece for review
alter table content_items add column if not exists derived_from uuid references content_items(id) on delete set null;
alter table content_items add column if not exists precisa_revisao text;
create index if not exists content_items_derived_idx on content_items(derived_from);

create or replace function public.flag_derived_for_review(p_origin uuid, p_motivo text) returns integer
language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  -- security invoker: RLS limits it to rows the caller can write
  with recursive tree as (
    select id from content_items where derived_from = p_origin
    union
    select c.id from content_items c join tree t on c.derived_from = t.id
  )
  update content_items set precisa_revisao = left(p_motivo, 300), updated_at = now() where id in (select id from tree);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.flag_derived_for_review(uuid, text) from public, anon;
grant execute on function public.flag_derived_for_review(uuid, text) to authenticated;

-- Curso de Milk Shake Profissional ControlPot (estrutura editável; nada fixo sem aprovação do Rodrigo)
create table course_lessons (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  modulo text not null,
  ordem smallint not null,
  titulo text not null,
  objetivo text not null default '',
  prerequisitos text not null default '',
  ingredientes jsonb not null default '[]'::jsonb,
  sku text,
  fonte_sorvete text not null default 'expresso' check (fonte_sorvete in ('expresso','balde','ambos','nenhum')),
  content_item_id uuid references content_items(id) on delete set null,
  status text not null default 'rascunho' check (status in ('rascunho','gravando','revisao_tecnica','aprovada','publicada')),
  versao integer not null default 1,
  updated_at timestamptz not null default now()
);
create index course_lessons_ws_idx on course_lessons(workspace_id, ordem);
alter table course_lessons enable row level security;
revoke all on course_lessons from anon, authenticated;
grant select, insert, update, delete on course_lessons to authenticated;
create policy course_lessons_select on course_lessons for select to authenticated using (public.is_workspace_member(workspace_id));
create policy course_lessons_insert on course_lessons for insert to authenticated with check (public.can_write_workspace(workspace_id));
-- 'publicada' is set only by the course platform (MMIX customer area), never by the recording app
create policy course_lessons_update on course_lessons for update to authenticated
  using (public.can_write_workspace(workspace_id)) with check (public.can_write_workspace(workspace_id) and status <> 'publicada');
create policy course_lessons_delete on course_lessons for delete to authenticated using (public.can_write_workspace(workspace_id) and status <> 'publicada');

-- Catálogo MMIX espelhado pelo worker (service role) para o perfil vinculado. Sem preço/estoque.
create table mmix_produtos (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  id integer not null,
  sku text not null,
  nome text not null,
  categoria text,
  modelo text,
  imagem text,
  synced_at timestamptz not null default now(),
  primary key (workspace_id, id)
);
alter table mmix_produtos enable row level security;
revoke all on mmix_produtos from anon, authenticated;
grant select on mmix_produtos to authenticated;
create policy mmix_produtos_select on mmix_produtos for select to authenticated using (public.is_workspace_member(workspace_id));
