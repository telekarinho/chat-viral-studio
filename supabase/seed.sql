-- Development seed: Rodrigo's workspace template (no members; real accounts are created via
-- bootstrap_workspace() during onboarding with the same defaults from @postai/domain).
insert into workspaces (id, name, slug)
values ('11111111-1111-1111-1111-111111111111', 'RodrigoSerra.me', 'rodrigoserra')
on conflict (slug) do nothing;

insert into creator_profiles (workspace_id, display_name, handle, positioning, signature, closing_phrase, tone, voice_rules)
values (
  '11111111-1111-1111-1111-111111111111',
  'Rodrigo Serra',
  'RodrigoSerra.me',
  'Vida real, evolução pessoal e reflexões de um homem 40+.',
  'RodrigoSerra.me',
  'E se der certo!',
  '{"human":true,"direct":true,"hopeful":true,"guru_like":false}'::jsonb,
  array['humano, próximo, simples, direto e esperançoso','fala com UMA pessoa','nunca guru ou coach genérico']
)
on conflict (workspace_id) do nothing;

insert into content_pillars (workspace_id, name, slug, target_percent) values
('11111111-1111-1111-1111-111111111111','Motivação e reflexão real','reflexao',40),
('11111111-1111-1111-1111-111111111111','Vida real / homem 40+ / maturidade','vida-real',20),
('11111111-1111-1111-1111-111111111111','Academia e evolução','academia',15),
('11111111-1111-1111-1111-111111111111','Família','familia',10),
('11111111-1111-1111-1111-111111111111','Humor','humor',10),
('11111111-1111-1111-1111-111111111111','Empreendedorismo','empreendedorismo',5)
on conflict do nothing;

insert into routines (id, workspace_id, name)
values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','Rotina padrão seg-sex')
on conflict do nothing;

insert into routine_blocks (workspace_id, routine_id, weekday, start_time, title, content_hint, optional, default_format)
select '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', d, t, title, hint, optional, fmt::content_format
from (values
('08:45'::time,'Café / B-roll','3 segundos do café',false,'broll'),
('09:10'::time,'Início do trabalho / B-roll','entrada no expediente',false,'broll'),
('10:30'::time,'Pensamento do Dia','vídeo curto 5–15s',false,'thought'),
('12:15'::time,'Almoço opcional','take de 3 segundos',true,'broll'),
('15:00'::time,'Trabalho / B-roll','algo real acontecendo na empresa',true,'broll'),
('17:30'::time,'Fim do expediente','encerramento do trabalho',false,'broll'),
('19:15'::time,'Preparação para academia','pré-treino / preparação',false,'broll'),
('19:30'::time,'Vídeo principal caminhando','45s–2m',false,'main_video'),
('20:15'::time,'Academia / B-roll','entrada, exercício ou final',false,'broll'),
('21:30'::time,'Fim do dia','encerramento',false,'broll')
) v(t,title,hint,optional,fmt)
cross join generate_series(1,5) d;
