// ============================================================
// AutoImport Tepic — Supabase Client
// ============================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://vxwmheehqqzybucaunkj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-PB6IaiPNF7TPnKGhPqxMQ_dc4Gd5G5';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Auth helpers ─────────────────────────────────────────────

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getSocio() {
  const session = await getSession();
  if (!session) return null;
  const { data } = await supabase
    .from('socios')
    .select('*')
    .eq('id', session.user.id)
    .single();
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = '/index.html';
}

// Protege cualquier página — redirige al login si no hay sesión
export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = '/index.html';
    return null;
  }
  return session;
}

// ── Autos ────────────────────────────────────────────────────

export async function getAutos() {
  const { data, error } = await supabase
    .from('v_costo_auto')
    .select('*')
    .order('fecha_compra', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getAuto(id) {
  const { data, error } = await supabase
    .from('v_costo_auto')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function crearAuto(auto) {
  const session = await getSession();
  const { data, error } = await supabase
    .from('autos')
    .insert({ ...auto, creado_por: session.user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function actualizarAuto(id, campos) {
  const { data, error } = await supabase
    .from('autos')
    .update(campos)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Etapas ───────────────────────────────────────────────────

export async function getEtapas(autoId) {
  const { data, error } = await supabase
    .from('etapas_auto')
    .select('*')
    .eq('auto_id', autoId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function crearEtapa(etapa) {
  const session = await getSession();
  const { data, error } = await supabase
    .from('etapas_auto')
    .insert({ ...etapa, registrado_por: session.user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function completarEtapa(id, fechaFinalizacion) {
  const { data, error } = await supabase
    .from('etapas_auto')
    .update({ fecha_finalizacion: fechaFinalizacion, completado: true })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Gastos ───────────────────────────────────────────────────

export async function getGastos(autoId) {
  const { data, error } = await supabase
    .from('gastos')
    .select('*, socios(nombre, avatar)')
    .eq('auto_id', autoId)
    .order('fecha_pago', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getGastosRecientes(limit = 10) {
  const { data, error } = await supabase
    .from('gastos')
    .select('*, socios(nombre, avatar), autos(marca, modelo, anio)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function crearGasto(gasto) {
  const session = await getSession();
  const { data, error } = await supabase
    .from('gastos')
    .insert({ ...gasto, registrado_por: session.user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Movimientos de caja ──────────────────────────────────────

export async function getMovimientos(limit = 20) {
  const { data, error } = await supabase
    .from('movimientos_caja')
    .select('*, socios(nombre), autos(marca, modelo, anio)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function liquidarVenta(autoId, precioVentaReal) {
  const session = await getSession();

  // 1. Obtener datos del auto
  const auto = await getAuto(autoId);
  const costoTotal = auto.costo_total;
  const ganancia = precioVentaReal - costoTotal;
  const ganCada = ganancia > 0 ? ganancia / 2 : 0;

  // 2. Determinar distribución según dist_ganancia
  let ganJoseph = 0, ganEmmanuel = 0;
  if (auto.dist_ganancia === '50_50') {
    ganJoseph = ganCada;
    ganEmmanuel = ganCada;
  } else if (auto.dist_ganancia === '100_joseph') {
    ganJoseph = ganancia > 0 ? ganancia : 0;
  } else if (auto.dist_ganancia === '100_emmanuel') {
    ganEmmanuel = ganancia > 0 ? ganancia : 0;
  }

  // 3. Registrar movimiento de caja
  const { error: movErr } = await supabase
    .from('movimientos_caja')
    .insert({
      tipo: 'liquidacion',
      auto_id: autoId,
      monto: precioVentaReal,
      precio_venta_real: precioVentaReal,
      costo_total_auto: costoTotal,
      ganancia_neta: ganancia,
      recupera_joseph: auto.aporte_joseph,
      recupera_emmanuel: auto.aporte_emmanuel,
      ganancia_joseph: ganJoseph,
      ganancia_emmanuel: ganEmmanuel,
      registrado_por: session.user.id,
    });
  if (movErr) throw movErr;

  // 4. Marcar auto como vendido
  await actualizarAuto(autoId, {
    status: 'vendido',
    precio_venta_real: precioVentaReal,
    fecha_vendido: new Date().toISOString().split('T')[0],
  });

  // 5. Liberar slot del préstamo si aplica
  if (auto.usa_prestamo) {
    await supabase
      .from('prestamo_slots')
      .update({ auto_id: null, libre: true, updated_at: new Date() })
      .eq('auto_id', autoId);
  }

  return { ganancia, ganJoseph, ganEmmanuel };
}

// ── Préstamo ─────────────────────────────────────────────────

export async function getSlots() {
  const { data, error } = await supabase
    .from('prestamo_slots')
    .select('*, autos(marca, modelo, anio)')
    .order('numero_slot');
  if (error) throw error;
  return data;
}

export async function asignarSlot(autoId) {
  const session = await getSession();
  const { data: slots } = await supabase
    .from('prestamo_slots')
    .select('*')
    .eq('libre', true)
    .limit(1);
  if (!slots || slots.length === 0) throw new Error('No hay slots disponibles');
  const slot = slots[0];
  await supabase
    .from('prestamo_slots')
    .update({ auto_id: autoId, libre: false, updated_at: new Date() })
    .eq('id', slot.id);
  await supabase.from('historial_prestamo').insert({
    tipo: 'asignacion',
    slot_id: slot.id,
    auto_id: autoId,
    monto: slot.monto,
    registrado_por: session.user.id,
  });
  return slot;
}

// ── Capital ──────────────────────────────────────────────────

export async function getCapital() {
  const { data, error } = await supabase
    .from('socios')
    .select(`
      id, nombre, avatar,
      gastos:gastos(monto),
      movimientos_joseph:movimientos_caja(ganancia_joseph),
      movimientos_emmanuel:movimientos_caja(ganancia_emmanuel),
      retiros_joseph:movimientos_caja(monto)
    `);
  if (error) throw error;
  return data;
}

// ── Storage: subir foto ──────────────────────────────────────

export async function subirFoto(file, path) {
  const { data, error } = await supabase.storage
    .from('comprobantes')
    .upload(path, file, { upsert: true });
  if (error) throw error;
  const { data: urlData } = supabase.storage
    .from('comprobantes')
    .getPublicUrl(path);
  return urlData.publicUrl;
}
