-- Música própria: origem "Biblioteca de Áudio do YouTube" (arquivo obtido lá pelo criador; declaração dele,
-- não é comprovação jurídica) e renomear (o criador edita o nome).
alter table musicas_proprias drop constraint if exists musicas_proprias_origem_check;
alter table musicas_proprias add constraint musicas_proprias_origem_check check (origem in ('minha', 'licenciada', 'youtube_audio_library'));
drop policy if exists musicas_proprias_update on musicas_proprias;
create policy musicas_proprias_update on musicas_proprias for update to authenticated
  using (public.can_write_workspace(workspace_id)) with check (public.can_write_workspace(workspace_id));

-- Favoritas: por pessoa e perfil, para aparecer em todos os aparelhos (biblioteca e músicas próprias "own:<id>").
create table if not exists musicas_favoritas (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  track_id text not null check (length(track_id) between 3 and 60),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id, track_id)
);
alter table musicas_favoritas enable row level security;
drop policy if exists musicas_favoritas_select on musicas_favoritas;
create policy musicas_favoritas_select on musicas_favoritas for select to authenticated
  using (user_id = auth.uid() and public.is_workspace_member(workspace_id));
drop policy if exists musicas_favoritas_insert on musicas_favoritas;
create policy musicas_favoritas_insert on musicas_favoritas for insert to authenticated
  with check (user_id = auth.uid() and public.is_workspace_member(workspace_id));
drop policy if exists musicas_favoritas_delete on musicas_favoritas;
create policy musicas_favoritas_delete on musicas_favoritas for delete to authenticated
  using (user_id = auth.uid());
