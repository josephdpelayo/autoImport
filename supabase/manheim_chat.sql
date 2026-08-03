-- ============================================================
-- TABLA: manheim_chat
-- Conversación continua de "mesa de análisis": Joseph va
-- compartiendo autos (VIN, texto, foto, PDF) y Claude los analiza
-- y compara, todo desde el celular. Una sola charla en curso.
-- ============================================================
create table manheim_chat (
  id              uuid primary key default uuid_generate_v4(),

  role            text not null check (role in ('user','assistant')),
  contenido       text not null,

  created_at      timestamptz default now()
);

alter table manheim_chat enable row level security;

create policy "autenticados ven todo" on manheim_chat
  for all using (auth.role() = 'authenticated');
