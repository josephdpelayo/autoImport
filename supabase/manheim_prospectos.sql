-- ============================================================
-- TABLA: manheim_prospectos
-- Candidatos de compra encontrados por el bot de Manheim
-- (manheim-bot/scan.js), para dar seguimiento desde la app.
-- ============================================================
create table manheim_prospectos (
  id              uuid primary key default uuid_generate_v4(),

  vin             text not null unique,
  titulo          text not null,
  anio            int,
  millas          int,
  grado           numeric(3,1),
  mmr             numeric(12,2),
  precio          text,                            -- "Buy Now $3800" / "Starting Bid $4500" / etc.

  ubicacion       text,
  subasta         text,
  busqueda        text,                            -- qué búsqueda guardada lo trajo (TEPIC - KIA FORTE, etc.)

  olor            text,
  accidentes      int,
  duenos          int,
  vendedor        text,

  notas_bot       jsonb default '[]'::jsonb,        -- notas automáticas (subprime, AutoCheck, llave/fob, excepción CVT)
  notas_usuario   text,                             -- notas manuales de Joseph/Emmanuel
  link            text,                             -- Condition Report / detail page en Manheim

  estado          text not null default 'nuevo',
  -- valores: 'nuevo' | 'interesado' | 'pujado' | 'descartado'

  first_seen      timestamptz default now(),
  updated_at      timestamptz default now()
);

create trigger trg_manheim_prospectos_updated_at
  before update on manheim_prospectos
  for each row execute function set_updated_at();

alter table manheim_prospectos enable row level security;

create policy "autenticados ven todo" on manheim_prospectos
  for all using (auth.role() = 'authenticated');
