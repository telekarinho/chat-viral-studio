-- Gravar patrimônio: the MMIX video factory lists the real footage it lacks (recording orders per product/clip);
-- the app records it and the worker forwards the take to MMIX (technical QA there → patrimônio asset).
-- The MMIX admin credential lives only in the worker (GitHub secret). The phone never talks to MMIX.

-- Orders mirrored by the worker (service role) into the ONE workspace linked to MMIX; members only read.
create table mmix_gravacao_ordens (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  id integer not null,               -- gravacao_solicitacoes.id in MMIX
  codigo text not null,
  produto_id integer,
  produto_nome text not null,
  titulo text,
  objetivo text,
  prioridade text,
  status text not null,
  detalhe jsonb not null,            -- clipes (per-clip status/rejection), checklist, evitar, config_tecnica, pessoa_regras, texto_falado
  synced_at timestamptz not null default now(),
  primary key (workspace_id, id)
);
alter table mmix_gravacao_ordens enable row level security;
revoke all on mmix_gravacao_ordens from anon, authenticated;
grant select on mmix_gravacao_ordens to authenticated;
create policy mmix_ordens_select on mmix_gravacao_ordens for select to authenticated using (public.is_workspace_member(workspace_id));

-- A take sent to an order clip. Only to orders mirrored into the same workspace (that is the allowlist).
create table patrimonio_envios (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  take_id uuid not null references takes(id) on delete cascade,
  ordem_id integer not null,
  clipe_num smallint not null check (clipe_num between 1 and 50),
  status text not null default 'queued' check (status in ('queued','sending','aprovado','reprovado','failed')),
  attempts smallint not null default 0,
  resultado jsonb,
  error text,
  requested_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, ordem_id) references mmix_gravacao_ordens(workspace_id, id) on delete cascade
);
create index patrimonio_envios_queue_idx on patrimonio_envios(status, created_at);
alter table patrimonio_envios enable row level security;
revoke all on patrimonio_envios from anon, authenticated;
grant select, insert on patrimonio_envios to authenticated;
create policy patrimonio_envios_select on patrimonio_envios for select to authenticated using (public.is_workspace_member(workspace_id));
create policy patrimonio_envios_insert on patrimonio_envios for insert to authenticated
  with check (
    public.can_write_workspace(workspace_id) and status = 'queued' and attempts = 0 and resultado is null and error is null
    and requested_by = auth.uid()
    and exists (select 1 from takes t where t.id = take_id and t.workspace_id = patrimonio_envios.workspace_id)
  );

-- worker: atomically claim the oldest queued send (service role only)
create function public.claim_patrimonio_envio() returns patrimonio_envios language sql security definer set search_path = public as $$
  update patrimonio_envios set status = 'sending', attempts = attempts + 1, updated_at = now()
  where id = (select id from patrimonio_envios where status = 'queued' and attempts < 3 order by created_at for update skip locked limit 1)
  returning *;
$$;
revoke all on function public.claim_patrimonio_envio() from public, anon, authenticated;
grant execute on function public.claim_patrimonio_envio() to service_role;
