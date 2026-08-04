-- Captura completa (screenshot) de la página real del Condition Report en
-- Manheim, tomada por el bot con sesión logueada. Se manda como imagen a la
-- IA para que "lea" el reporte completo (daños, fotos, comentarios, título)
-- y dé su propio criterio, en vez de depender solo de campos estructurados.
alter table manheim_prospectos add column if not exists cr_screenshot_url text;

insert into storage.buckets (id, name, public)
values ('condition-reports', 'condition-reports', true)
on conflict (id) do nothing;
