-- Montagem: resultado visível (avisos, cortes, capa, transcrição) e recuperação de jobs travados.

alter table render_jobs add column if not exists result jsonb;

-- 1) job "rendering"/"sending" parado há mais de 20 min (servidor caiu no meio) volta para a fila;
-- 2) a fila anda por updated_at: um job que ainda não pode rodar (partes subindo) vai para o fim
--    e não trava os outros.
create or replace function public.claim_render_job() returns render_jobs language sql security definer set search_path = public as $$
  update render_jobs set status = 'rendering', attempts = attempts + 1, updated_at = now()
  where id = (
    select id from render_jobs
    where attempts < 3 and (status = 'queued' or (status = 'rendering' and updated_at < now() - interval '20 minutes'))
    order by updated_at for update skip locked limit 1
  )
  returning *;
$$;
revoke all on function public.claim_render_job() from public, anon, authenticated;
grant execute on function public.claim_render_job() to service_role;

-- travado e sem tentativas sobrando: vira falha visível (em vez de "montando…" para sempre)
create or replace function public.fail_stale_jobs() returns integer language plpgsql security definer set search_path = public as $$
declare n integer; m integer;
begin
  update render_jobs set status = 'failed', error = coalesce(error, 'a montagem foi interrompida 3 vezes'), updated_at = now()
  where attempts >= 3 and status in ('queued', 'rendering') and updated_at < now() - interval '20 minutes';
  get diagnostics n = row_count;
  update patrimonio_envios set status = 'failed', error = coalesce(error, 'o envio foi interrompido 3 vezes'), updated_at = now()
  where attempts >= 3 and status in ('queued', 'sending') and updated_at < now() - interval '20 minutes';
  get diagnostics m = row_count;
  return n + m;
end $$;
revoke all on function public.fail_stale_jobs() from public, anon, authenticated;
grant execute on function public.fail_stale_jobs() to service_role;

create or replace function public.claim_patrimonio_envio() returns patrimonio_envios language sql security definer set search_path = public as $$
  update patrimonio_envios set status = 'sending', attempts = attempts + 1, updated_at = now()
  where id = (
    select id from patrimonio_envios
    where attempts < 3 and (status = 'queued' or (status = 'sending' and updated_at < now() - interval '20 minutes'))
    order by updated_at for update skip locked limit 1
  )
  returning *;
$$;
revoke all on function public.claim_patrimonio_envio() from public, anon, authenticated;
grant execute on function public.claim_patrimonio_envio() to service_role;

-- um pedido de montagem por vez para cada conteúdo+versão (o app pede sozinho; nunca duplica)
create unique index if not exists render_jobs_one_active_idx
  on render_jobs (content_item_id, (coalesce(plan->>'variant', 'completo')))
  where status in ('queued', 'rendering');
