-- El bot ya revisaba título/luz azul/daño estructural/salvage/TRA/drivable/motor
-- para decidir si un auto pasa el filtro, pero nunca los guardaba — por eso la IA
-- de la Mesa de análisis no podía dar veredicto real y repetía el mismo checklist
-- genérico ("verifica el título, verifica que no sea daño estructural...") en
-- cada carro, sin importar cuál fuera.
alter table manheim_prospectos add column if not exists titulo_estado text;
alter table manheim_prospectos add column if not exists luz_azul boolean;
alter table manheim_prospectos add column if not exists dano_estructural boolean;
alter table manheim_prospectos add column if not exists salvage boolean;
alter table manheim_prospectos add column if not exists canal_tra boolean;
alter table manheim_prospectos add column if not exists drivable boolean;
alter table manheim_prospectos add column if not exists motor_enciende boolean;
alter table manheim_prospectos add column if not exists danos jsonb default '[]'::jsonb;
