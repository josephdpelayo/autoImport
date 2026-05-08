-- ============================================================
-- AUTOIMPORT TEPIC — Esquema completo de base de datos
-- Pega este SQL en Supabase > SQL Editor > New Query
-- ============================================================


-- ============================================================
-- 1. EXTENSIONES
-- ============================================================
create extension if not exists "uuid-ossp";


-- ============================================================
-- 2. TABLA: socios
-- Guarda el perfil de cada usuario (Joseph y Emmanuel)
-- Se crea automáticamente al registrar el usuario en Auth
-- ============================================================
create table socios (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text not null,                        -- 'Joseph' o 'Emmanuel'
  email       text not null,
  avatar      text,                                 -- iniciales o URL de foto
  created_at  timestamptz default now()
);


-- ============================================================
-- 3. TABLA: autos
-- Cada carro que compran, importan y venden
-- ============================================================
create table autos (
  id                  uuid primary key default uuid_generate_v4(),

  -- Datos básicos
  marca               text not null,                -- 'NISSAN'
  modelo              text not null,                -- 'SENTRA BLANCO'
  anio                int not null,
  vin                 text,
  millas              int,
  color               text,

  -- Status del auto
  status              text not null default 'comprado',
  -- valores: 'comprado' | 'transporte_usa' | 'importacion' | 'transporte_tepic'
  --          | 'taller' | 'en_venta' | 'vendido'

  -- Distribución de ganancia
  dist_ganancia       text not null default '50_50',
  -- valores: '50_50' | '100_joseph' | '100_emmanuel'

  -- Financiamiento
  usa_prestamo        boolean default true,         -- ¿usa slot del préstamo?

  -- Aportaciones iniciales
  aporte_joseph       numeric(12,2) default 0,
  aporte_emmanuel     numeric(12,2) default 0,

  -- Precio estimado y real de venta
  precio_venta_estimado  numeric(12,2),
  precio_venta_real      numeric(12,2),            -- se llena al vender

  -- Fechas clave
  fecha_compra        date,
  fecha_vendido       date,

  -- Control
  creado_por          uuid references socios(id),
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);


-- ============================================================
-- 4. TABLA: etapas_auto
-- Cada etapa del proceso logístico de un auto
-- Una etapa tiene fecha de pago y fecha de finalización separadas
-- ============================================================
create table etapas_auto (
  id                  uuid primary key default uuid_generate_v4(),
  auto_id             uuid not null references autos(id) on delete cascade,

  tipo                text not null,
  -- valores: 'compra' | 'transporte_usa' | 'importacion' | 'transporte_tepic'

  -- Compra: precio en USD y conversión real
  monto_usd           numeric(10,2),               -- precio del dealer en USD
  monto_mxn_banco     numeric(12,2),               -- lo que salió del banco en MXN
  tipo_cambio_real    numeric(8,4),                -- calculado: mxn_banco / usd

  -- Monto final en MXN (lo que se usa para calcular costos)
  monto_mxn           numeric(12,2) not null default 0,

  -- Fechas separadas
  fecha_pago          date,                        -- cuando se hizo el pago
  fecha_finalizacion  date,                        -- cuando se completó la operación

  -- Estado
  pagado              boolean default false,
  completado          boolean default false,       -- fecha_finalizacion registrada

  -- Notas y comprobante
  notas               text,
  foto_url            text,                        -- URL en Supabase Storage

  -- Control
  registrado_por      uuid references socios(id),
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);


-- ============================================================
-- 5. TABLA: gastos
-- Gastos de operación de cada auto (reparaciones, detallado, etc.)
-- ============================================================
create table gastos (
  id              uuid primary key default uuid_generate_v4(),
  auto_id         uuid not null references autos(id) on delete cascade,

  -- Categoría
  categoria       text not null,
  -- valores: 'mecanica' | 'carroceria' | 'detallado' | 'electrico'
  --          | 'llantas' | 'accesorios' | 'movilidad' | 'otros'

  monto           numeric(12,2) not null,
  fecha_pago      date not null default current_date,
  notas           text,
  foto_url        text,                            -- URL en Supabase Storage

  -- Quién pagó
  pagado_por      uuid not null references socios(id),

  -- Control
  registrado_por  uuid references socios(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);


-- ============================================================
-- 6. TABLA: movimientos_caja
-- Liquidaciones, retiros y pagos al préstamo
-- ============================================================
create table movimientos_caja (
  id              uuid primary key default uuid_generate_v4(),

  tipo            text not null,
  -- valores: 'liquidacion' | 'retiro_joseph' | 'retiro_emmanuel' | 'pago_prestamo'

  auto_id         uuid references autos(id),       -- solo en liquidaciones

  monto           numeric(12,2) not null,

  -- En liquidaciones, detalle del desglose
  precio_venta_real     numeric(12,2),
  costo_total_auto      numeric(12,2),
  ganancia_neta         numeric(12,2),
  recupera_joseph       numeric(12,2),
  recupera_emmanuel     numeric(12,2),
  ganancia_joseph       numeric(12,2),
  ganancia_emmanuel     numeric(12,2),

  notas           text,

  -- Control
  registrado_por  uuid references socios(id),
  created_at      timestamptz default now()
);


-- ============================================================
-- 7. TABLA: prestamo_slots
-- Rastrea los $200k del préstamo — 2 slots de $100k cada uno
-- ============================================================
create table prestamo_slots (
  id              uuid primary key default uuid_generate_v4(),

  numero_slot     int not null check (numero_slot in (1, 2)),
  monto           numeric(12,2) not null default 100000,

  -- A qué auto está asignado actualmente
  auto_id         uuid references autos(id),
  libre           boolean default true,

  updated_at      timestamptz default now()
);

-- Insertar los 2 slots iniciales
insert into prestamo_slots (numero_slot, libre) values (1, true);
insert into prestamo_slots (numero_slot, libre) values (2, true);


-- ============================================================
-- 8. TABLA: historial_prestamo
-- Log de cada movimiento del fondo del préstamo
-- ============================================================
create table historial_prestamo (
  id              uuid primary key default uuid_generate_v4(),

  tipo            text not null,
  -- valores: 'asignacion' | 'liberacion' | 'devolucion_papa'

  slot_id         uuid references prestamo_slots(id),
  auto_id         uuid references autos(id),
  monto           numeric(12,2) not null,
  notas           text,

  registrado_por  uuid references socios(id),
  created_at      timestamptz default now()
);


-- ============================================================
-- 9. TABLA: capital_socios
-- Snapshot del capital de cada socio — se actualiza en cada
-- movimiento de caja para tener historial
-- ============================================================
create table capital_socios (
  id              uuid primary key default uuid_generate_v4(),

  socio_id        uuid not null references socios(id),
  movimiento_id   uuid references movimientos_caja(id),

  -- Montos antes y después del movimiento
  inv_antes       numeric(12,2) not null default 0,
  gan_antes       numeric(12,2) not null default 0,
  ret_antes       numeric(12,2) not null default 0,

  inv_despues     numeric(12,2) not null default 0,
  gan_despues     numeric(12,2) not null default 0,
  ret_despues     numeric(12,2) not null default 0,

  concepto        text,
  created_at      timestamptz default now()
);


-- ============================================================
-- 10. VISTAS ÚTILES
-- ============================================================

-- Vista: costo total por auto (suma etapas + gastos)
create or replace view v_costo_auto as
select
  a.id,
  a.marca,
  a.modelo,
  a.anio,
  a.status,
  a.dist_ganancia,
  a.usa_prestamo,
  a.aporte_joseph,
  a.aporte_emmanuel,
  a.precio_venta_estimado,
  a.precio_venta_real,
  a.fecha_compra,
  a.fecha_vendido,
  coalesce(sum(e.monto_mxn), 0)                     as total_etapas,
  coalesce(sum(g.monto), 0)                          as total_gastos,
  coalesce(sum(e.monto_mxn), 0) +
    coalesce(sum(g.monto), 0)                        as costo_total,
  a.precio_venta_estimado - (
    coalesce(sum(e.monto_mxn), 0) +
    coalesce(sum(g.monto), 0)
  )                                                  as ganancia_estimada,
  a.precio_venta_real - (
    coalesce(sum(e.monto_mxn), 0) +
    coalesce(sum(g.monto), 0)
  )                                                  as ganancia_real,
  a.fecha_vendido - a.fecha_compra                   as dias_total
from autos a
left join etapas_auto e on e.auto_id = a.id
left join gastos g on g.auto_id = a.id
group by a.id;

-- Vista: capital actual de cada socio
create or replace view v_capital_socios as
select
  s.id,
  s.nombre,
  coalesce(sum(g.monto) filter (where g.pagado_por = s.id), 0)   as total_aportado,
  coalesce(sum(mc.ganancia_joseph) filter (where s.nombre = 'Joseph'), 0) +
  coalesce(sum(mc.ganancia_emmanuel) filter (where s.nombre = 'Emmanuel'), 0) as ganancia_acumulada
from socios s
left join gastos g on g.pagado_por = s.id
left join movimientos_caja mc on mc.tipo = 'liquidacion'
group by s.id, s.nombre;


-- ============================================================
-- 11. TRIGGERS: updated_at automático
-- ============================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_autos_updated_at
  before update on autos
  for each row execute function set_updated_at();

create trigger trg_etapas_updated_at
  before update on etapas_auto
  for each row execute function set_updated_at();

create trigger trg_gastos_updated_at
  before update on gastos
  for each row execute function set_updated_at();


-- ============================================================
-- 12. ROW LEVEL SECURITY (RLS)
-- Solo usuarios autenticados pueden ver y modificar datos
-- ============================================================
alter table socios          enable row level security;
alter table autos           enable row level security;
alter table etapas_auto     enable row level security;
alter table gastos          enable row level security;
alter table movimientos_caja enable row level security;
alter table prestamo_slots  enable row level security;
alter table historial_prestamo enable row level security;
alter table capital_socios  enable row level security;

-- Política: cualquier usuario autenticado ve todo
create policy "autenticados ven todo" on socios
  for select using (auth.role() = 'authenticated');

create policy "autenticados ven todo" on autos
  for all using (auth.role() = 'authenticated');

create policy "autenticados ven todo" on etapas_auto
  for all using (auth.role() = 'authenticated');

create policy "autenticados ven todo" on gastos
  for all using (auth.role() = 'authenticated');

create policy "autenticados ven todo" on movimientos_caja
  for all using (auth.role() = 'authenticated');

create policy "autenticados ven todo" on prestamo_slots
  for all using (auth.role() = 'authenticated');

create policy "autenticados ven todo" on historial_prestamo
  for all using (auth.role() = 'authenticated');

create policy "autenticados ven todo" on capital_socios
  for all using (auth.role() = 'authenticated');


-- ============================================================
-- 13. STORAGE: bucket para fotos de comprobantes
-- ============================================================
-- Crea el bucket desde Supabase Dashboard > Storage > New Bucket
-- Nombre: 'comprobantes'
-- Public: NO (privado, solo usuarios autenticados)
-- Después agrega esta política en Storage > Policies:
--
-- Nombre: "autenticados pueden subir y ver"
-- Allowed operations: SELECT, INSERT
-- Target roles: authenticated
-- ============================================================


-- ============================================================
-- FIN DEL SCHEMA
-- ============================================================
-- Tablas creadas:
--   socios, autos, etapas_auto, gastos,
--   movimientos_caja, prestamo_slots,
--   historial_prestamo, capital_socios
--
-- Vistas:
--   v_costo_auto, v_capital_socios
--
-- Siguiente paso:
--   1. Pega este SQL en Supabase > SQL Editor > Run
--   2. Ve a Authentication > Users > Invite user
--      → joseph@autoimport.com
--      → emmanuel@autoimport.com
--   3. Ve a Storage > New Bucket → 'comprobantes'
--   4. Avísame y arrancamos con el HTML/JS
-- ============================================================
