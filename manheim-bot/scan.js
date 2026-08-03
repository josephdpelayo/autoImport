const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const {
  savedSearches,
  filterRanges,
  blacklistModels,
  blacklistExceptionTransmission,
  blacklistMileageException,
  mechanicalKeywords,
  subprimeLenders,
} = require('./config');
const { notify, notifyPhone } = require('./notify');
const { sb } = require('./supabase');

const PROFILE_DIR = path.join(__dirname, '.chrome-profile');
const SEEN_PATH = path.join(__dirname, 'seen.json');
const RESULTS_URL = 'https://search.manheim.com/results';

function loadSeen() {
  try {
    return JSON.parse(fs.readFileSync(SEEN_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveSeen(seen) {
  fs.writeFileSync(SEEN_PATH, JSON.stringify(seen, null, 2));
}

async function collectListingsForSearch(page, chipText) {
  await page.goto(RESULTS_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  const loginForm = await page.locator('input[type="password"]').count();
  if (loginForm > 0) {
    throw new Error('SESSION_EXPIRED');
  }

  const chip = page.locator('.MuiChip-label', { hasText: chipText }).first();
  try {
    await chip.waitFor({ state: 'visible', timeout: 25000 });
  } catch {
    console.warn(`Aviso: no encontré la búsqueda guardada "${chipText}". ¿Sigue existiendo en tu cuenta con ese nombre?`);
    return [];
  }
  await chip.click();
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);

  let raw = [];
  for (let attempt = 0; attempt < 3 && raw.length === 0; attempt++) {
    raw = await page.$$eval('[data-test-id="stockwave-info"]', (els) =>
      els.map((el) => {
        try {
          return JSON.parse(el.textContent);
        } catch {
          return null;
        }
      }).filter(Boolean)
    );
    if (raw.length === 0) await page.waitForTimeout(2000);
  }
  return raw.map((r) => ({ ...r, _searchLabel: chipText }));
}

function importableVin(vin) {
  return /^[12345]/.test(vin);
}

// sourceModel viene como arreglo de variantes en orden impredecible
// (ej. ["SV","SENTRA","SENT SV"]), nunca confiar solo en sourceModel[0].
function modelKeywordBlob(listing) {
  const parts = [];
  const dd = listing.designatedDescriptionEnrichment;
  if (dd && dd.model) parts.push(dd.model);
  if (Array.isArray(listing.sourceModel)) parts.push(...listing.sourceModel);
  else if (listing.sourceModel) parts.push(listing.sourceModel);
  return parts.join(' ').toLowerCase();
}

function titleFor(listing) {
  const dd = listing.designatedDescriptionEnrichment;
  const short = dd && dd.manheimStandardDescription && dd.manheimStandardDescription.shortDescription;
  if (short) return short;
  const model = (dd && dd.model) || (Array.isArray(listing.sourceModel) ? listing.sourceModel[0] : listing.sourceModel) || '';
  return `${listing.year} ${listing.make} ${model} ${listing.sourceTrim || ''}`.replace(/\s+/g, ' ').trim();
}

function mechanicalFlagHit(listings) {
  const kw = mechanicalKeywords.map((k) => k.toLowerCase());
  for (const l of listings) {
    const damages = (l.conditionEnrichment && l.conditionEnrichment.damages) || [];
    const parts = [JSON.stringify(l.announcementsEnrichment || '')];
    for (const d of damages) parts.push(d.item || '', d.category || '', d.damage || '');
    const blob = parts.join(' ').toLowerCase();
    if (kw.some((k) => blob.includes(k))) return true;
  }
  return false;
}

function evaluateBlacklist(listings) {
  const modelBlob = modelKeywordBlob(listings[0]);
  if (!blacklistModels.some((m) => modelBlob.includes(m))) {
    return { excluded: false };
  }

  const transmission = (listings[0].transmission || '').toLowerCase();
  if (transmission.includes(blacklistExceptionTransmission)) {
    return { excluded: false };
  }

  const minOdometer = Math.min(...listings.map((l) => l.odometer ?? Infinity));
  const lowMileage = minOdometer <= blacklistMileageException;
  const mechanicalHit = mechanicalFlagHit(listings);

  if (lowMileage && !mechanicalHit) {
    return {
      excluded: false,
      note: `Excepción CVT por bajo kilometraje (${minOdometer} mi) — confirma en el detail page que el daño es de choque, no mecánico`,
    };
  }

  const why = lowMileage
    ? 'hay señal de problema mecánico en daños/anuncios pese al bajo kilometraje'
    : `${minOdometer} mi excede el tope de excepción (${blacklistMileageException} mi)`;
  return { excluded: true, reason: `Modelo en lista negra (riesgo CVT) — ${why}` };
}

function evaluateVinGroup(vin, listings) {
  const reasons = [];
  const notes = [];

  if (!importableVin(vin)) {
    reasons.push('VIN no inicia en 1-5 (no importable bajo T-MEC / no armado en Norteamérica)');
  }
  if (listings.some((l) => l.blueLight)) {
    reasons.push('Luz azul en al menos un canal (título ausente o demorado)');
  }
  if (listings.some((l) => (l.titleStatus || '').toLowerCase().includes('absent'))) {
    reasons.push('titleStatus indica título ausente');
  }
  if (listings.some((l) => l.hasFrameDamage)) {
    reasons.push('Daño estructural (frame damage)');
  }
  if (listings.some((l) => l.salvageVehicle)) {
    reasons.push('Vehículo salvage');
  }
  if (listings.some((l) => l.isTra)) {
    reasons.push('Canal TRA (siniestros / no reparable)');
  }
  if (listings.some((l) => l.isDrivable === false)) {
    reasons.push('No Drivable');
  }
  if (listings.some((l) => l.conditionEnrichment && l.conditionEnrichment.engineStarts === false)) {
    reasons.push('Motor no enciende (engineStarts: false)');
  }

  const grade = parseFloat((listings[0].conditionEnrichment && listings[0].conditionEnrichment.grade) ?? NaN);
  if (!Number.isNaN(grade) && (grade < filterRanges.gradeMin || grade > filterRanges.gradeMax)) {
    reasons.push(`Grado ${grade} fuera de rango (${filterRanges.gradeMin}-${filterRanges.gradeMax})`);
  }
  const odometer = listings[0].odometer;
  if (odometer != null && odometer > filterRanges.odometerMax) {
    reasons.push(`Odómetro ${odometer} mi excede el máximo (${filterRanges.odometerMax} mi)`);
  }
  const mmr = listings[0].mmrPrice;
  if (mmr != null && (mmr < filterRanges.mmrMin || mmr > filterRanges.mmrMax)) {
    reasons.push(`MMR ajustado $${mmr} fuera de rango ($${filterRanges.mmrMin}-$${filterRanges.mmrMax})`);
  }

  const blacklistResult = evaluateBlacklist(listings);
  if (blacklistResult.excluded) reasons.push(blacklistResult.reason);
  if (blacklistResult.note) notes.push(blacklistResult.note);

  if (listings.some((l) => l.autocheck && l.autocheck.vehicleUseAndEventCheckOK === false)) {
    notes.push('AutoCheck: "specific issue(s) or events identified" — revisa el historial completo');
  }
  const sellerName = (listings[0].sellerName || '').toLowerCase();
  if (subprimeLenders.some((s) => sellerName.includes(s))) {
    notes.push(`Vendedor financiera subprime (${listings[0].sellerName}) — mayor probabilidad de repo/abandono`);
  }

  return { reasons, notes };
}

function bestListing(listings) {
  return [...listings].sort((a, b) => {
    const pa = a.buyNowPrice || a.startingBidPrice || a.mmrPrice || Infinity;
    const pb = b.buyNowPrice || b.startingBidPrice || b.mmrPrice || Infinity;
    return pa - pb;
  })[0];
}

function detailUrl(listing) {
  if (listing.conditionReportUrl) return 'https:' + listing.conditionReportUrl;
  return `https://search.manheim.com/results#/details/${listing.vin}/${listing.source || 'OVE'}`;
}

function formatCandidate(vin, listings, notes) {
  const l = bestListing(listings);
  const ce = l.conditionEnrichment || {};
  const price = l.buyNowPrice ? `Buy Now $${l.buyNowPrice}` : (l.startingBidPrice ? `Starting Bid $${l.startingBidPrice}` : 'N/A');
  return {
    vin,
    titulo: titleFor(l),
    anio: l.year,
    millas: l.odometer,
    grado: ce.grade,
    mmrAjustado: l.mmrPrice,
    precio: price,
    ubicacion: l.pickupLocation,
    subasta: l.auctionName,
    olor: ce.interiorOdor && ce.interiorOdor !== 'None' ? ce.interiorOdor : null,
    accidentes: l.autocheck ? l.autocheck.numberOfAccidents : null,
    duenos: l.autocheck ? l.autocheck.ownerCount : null,
    vendedor: l.sellerName || null,
    link: detailUrl(l),
    busqueda: l._searchLabel,
    notes: notes || [],
  };
}

async function scrapeConditionReport(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    return await page.evaluate(() => {
      const keysFobsLinks = Array.from(document.querySelectorAll('a[href="#details_keys"]'));
      const keysFobsNums = keysFobsLinks.map((a) => {
        const spans = a.querySelectorAll('span');
        return spans[1] ? spans[1].textContent.trim() : null;
      });
      return {
        keys: keysFobsNums[0] ?? null,
        fobs: keysFobsNums[1] ?? null,
      };
    });
  } catch {
    return null;
  }
}

function addConditionReportNotes(survivor, cr) {
  if (!cr) return;
  // Llantas y refacción NO se marcan: en Tepic se reemplazan baratísimo, no es
  // señal de riesgo para este negocio.
  // Traer solo 1 llave o solo 1 fob es normal (autos keyless solo traen fob, Keys: 0
  // no implica problema) — el costo real solo aparece si NO hay ninguna forma de
  // arrancar el auto (0 llaves y 0 fobs a la vez).
  if (cr.keys === '0' && cr.fobs === '0') {
    survivor.notes.push('Sin llave ni fob (0 y 0) — duplicado + programación ~$2,500-3,500 MXN');
  }
}

async function upsertProspectos(survivors) {
  if (survivors.length === 0) return;
  const rows = survivors.map((s) => ({
    vin: s.vin,
    titulo: s.titulo,
    anio: s.anio ?? null,
    millas: s.millas ?? null,
    grado: s.grado ? parseFloat(s.grado) : null,
    mmr: s.mmrAjustado ?? null,
    precio: s.precio,
    ubicacion: s.ubicacion,
    subasta: s.subasta,
    busqueda: s.busqueda,
    olor: s.olor,
    accidentes: s.accidentes ?? null,
    duenos: s.duenos ?? null,
    vendedor: s.vendedor,
    notas_bot: s.notes,
    link: s.link,
  }));
  const { error } = await sb.from('manheim_prospectos').upsert(rows, { onConflict: 'vin' });
  if (error) console.error('No se pudo escribir en Supabase:', error.message);
}

async function run() {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1400, height: 1000 },
  });
  const page = context.pages()[0] || (await context.newPage());

  let allListings = [];
  try {
    for (const chipText of savedSearches) {
      const listings = await collectListingsForSearch(page, chipText);
      allListings = allListings.concat(listings);
    }
  } catch (e) {
    await context.close();
    if (e.message === 'SESSION_EXPIRED') {
      console.error('\nTu sesión de Manheim expiró. Corre: node login.js\n');
      process.exit(1);
    }
    throw e;
  }

  const byVin = {};
  for (const l of allListings) {
    if (!byVin[l.vin]) byVin[l.vin] = [];
    byVin[l.vin].push(l);
  }

  const survivors = [];
  const descartes = [];
  for (const [vin, listings] of Object.entries(byVin)) {
    const { reasons, notes } = evaluateVinGroup(vin, listings);
    if (reasons.length === 0) {
      survivors.push(formatCandidate(vin, listings, notes));
    } else {
      descartes.push({ vin, titulo: formatCandidate(vin, listings, notes).titulo, reasons });
    }
  }

  for (const s of survivors) {
    if (s.link.startsWith('https://insightcr.manheim.com')) {
      const cr = await scrapeConditionReport(page, s.link);
      addConditionReportNotes(s, cr);
    }
  }
  await context.close();

  await upsertProspectos(survivors);

  const seen = loadSeen();
  const nuevos = survivors.filter((s) => !seen[s.vin]);

  console.log(`\n=== Análisis Manheim — ${new Date().toLocaleString('es-MX')} ===\n`);
  console.log(`Sobrevivientes: ${survivors.length} | Descartados: ${descartes.length}\n`);

  for (const s of survivors) {
    const tag = seen[s.vin] ? '' : ' [NUEVO]';
    console.log(`${tag ? '🆕' : '  '} ${s.vin} — ${s.titulo}${tag}`);
    console.log(`     ${s.millas} mi | grado ${s.grado} | MMR $${s.mmrAjustado} | ${s.precio}`);
    console.log(`     ${s.ubicacion} | ${s.subasta} | ${s.busqueda}`);
    if (s.olor) console.log(`     ⚠️  Olor: ${s.olor}`);
    if (s.accidentes) console.log(`     ⚠️  Accidentes reportados: ${s.accidentes}`);
    if (s.vendedor) console.log(`     Vendedor: ${s.vendedor}${s.duenos ? ` | Dueños: ${s.duenos}` : ''}`);
    for (const note of s.notes) console.log(`     ℹ️  ${note}`);
    console.log(`     ${s.link}`);
    console.log('');
  }

  if (descartes.length > 0) {
    console.log('--- Descartados ---');
    for (const d of descartes) {
      console.log(`  ${d.vin} — ${d.titulo}: ${d.reasons.join('; ')}`);
    }
    console.log('');
  }

  for (const s of survivors) {
    if (!seen[s.vin]) seen[s.vin] = { firstSeen: new Date().toISOString(), titulo: s.titulo };
  }
  saveSeen(seen);

  if (nuevos.length > 0) {
    const resumen = nuevos.map((s) => `${s.titulo} (${s.vin.slice(-6)}) — ${s.precio}`).join(' | ');
    notify('Manheim — nuevo candidato', resumen);
    const mensaje = `Manheim — ${nuevos.length} candidato(s) nuevo(s):\n` +
      nuevos.map((s) => `• ${s.titulo} (${s.vin.slice(-6)}) — ${s.millas}mi, grado ${s.grado}, ${s.precio}`).join('\n');
    notifyPhone(mensaje);
  } else {
    console.log('Sin candidatos nuevos desde la última corrida.');
  }
}

run();
