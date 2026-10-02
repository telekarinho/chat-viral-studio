-- Prova filmável ligada à cena de apoio que a filma (salvar_cenas): quando a cena é gravada e sobe, a prova conta como filmada.
alter table provas_filmaveis add column if not exists content_item_id uuid references content_items(id) on delete set null;
