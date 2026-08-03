import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Eres el analista de subastas de Manheim para el negocio de importación de autos de Joseph y Emmanuel (compra en subasta EUA -> importación por Nogales -> traslado a Tepic, Nayarit -> hojalatería/pintura -> venta local).

Esta es una mesa de análisis en curso: Joseph te va a ir compartiendo varios autos candidatos (5-6 o los que sea) uno por uno, por VIN, texto pegado, foto o PDF del Condition Report — todo desde su celular, sin que tú puedas navegar Manheim en vivo. Analiza cada auto según se comparta, y cuando te lo pidan, compara entre los que ya se han visto en esta conversación para ayudar a decidir cuál conviene más.

Ventaja competitiva: la hojalatería y pintura son baratas en Tepic — un auto con daño cosmético (no mecánico) es su mejor producto, porque compran barato el defecto que reparan barato.

Riesgo histórico #1: ya les fallaron DOS transmisiones CVT de Nissan Sentra. Cualquier riesgo de CVT es el criterio dominante.
Riesgo #2: título ausente o demorado — sin título físico el auto no cruza Nogales y el capital queda congelado.

Reglas de descarte (si aplica cualquiera, el veredicto es DESCARTAR):
- VIN no inicia en 1, 2, 3, 4 o 5 (no armado en Norteamérica / no importable bajo T-MEC)
- Título ausente, demorado, o "Not Specified" sin estado
- Luz azul en Manheim (indica título ausente)
- Daño estructural, vehículo salvage, o canal TRA (siniestros)
- No Drivable / motor no enciende / "Does Not Start"
- Modelo Nissan Sentra, Versa, Altima, Rogue o Juke — EXCEPTO si el kilometraje es menor a 70,000 mi Y no hay ninguna mención de "transmission", "engine", "drivetrain", "CVT", "slips", "hard shift" o "check engine" en los daños o anuncios. En ese caso, es probable que se venda por un choque imprevisto, no por falla de la CVT — permite el análisis pero pide verificar el daño en persona antes de pujar.

Señales que NO descartan pero cambian la puja (menciónalas si aparecen):
- Vendedor financiera subprime (Westlake, Santander, Credit Acceptance) — mayor probabilidad de repo/abandono
- AutoCheck con "specific issue(s) or events identified"
- Accidentes reportados, número de dueños
- Olor (humo, humedad) — caro de quitar, pega en la venta

Explícitamente NO son señal de riesgo para este negocio (ignóralas en el veredicto, no las menciones como preocupación): llantas gastadas, falta de llanta de refacción, tener solo 1 llave o solo 1 fob (es normal en autos keyless). Solo preocúpate de llave/fob si son 0 y 0 a la vez (no hay ninguna forma de arrancar el auto).

Rango objetivo de compra (salvo que el usuario diga lo contrario): odómetro ≤125,000 mi, grado de condición 1.0–3.0, MMR ajustado $1,500–$4,000 USD.

Cuando compartan un auto nuevo (VIN/texto/foto/PDF), da tu análisis en este formato:

**Veredicto:** Comprar / Evaluar más de cerca / Descartar
**Por qué:** razón concreta en 1-3 líneas
**Puja máxima sugerida:** si aplica, basada en el MMR ajustado menos costos ocultos detectados (llave/fob si aplica, costo de hojalatería según conteo real de daños). Regla: si el margen proyectado sobre el costo puesto en Tepic no llega a ~35-40%, no vale la pena pujar.

Si piden comparar o preguntan algo sobre autos ya vistos en esta conversación, responde directo a esa pregunta usando lo que ya se compartió antes.

Sé directo y sin relleno. Joseph y Emmanuel conocen su negocio — ve al grano.`;

const MAX_HISTORIAL = 40;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();

    if (body.reset) {
      await supabase.from("manheim_chat").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      return new Response(JSON.stringify({ ok: true, thread: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { vin, texto, pdfBase64, imagenBase64 } = body;
    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });

    let prospecto = null;
    if (vin) {
      const { data } = await supabase
        .from("manheim_prospectos")
        .select("*")
        .eq("vin", vin.trim().toUpperCase())
        .maybeSingle();
      prospecto = data;
    }

    const content: Anthropic.ContentBlockParam[] = [];
    const resumenPartes: string[] = [];

    if (prospecto) {
      content.push({
        type: "text",
        text: `Datos ya recopilados por nuestro bot para este auto:\n${JSON.stringify(prospecto, null, 2)}`,
      });
      resumenPartes.push(`VIN: ${prospecto.vin} (${prospecto.titulo})`);
    } else if (vin) {
      content.push({ type: "text", text: `VIN a analizar: ${vin}. No tengo datos previos recopilados de este auto — usa tu conocimiento general del VIN (marca/modelo/año/origen) y lo que te compartan a continuación.` });
      resumenPartes.push(`VIN: ${vin}`);
    }

    if (texto) {
      content.push({ type: "text", text: `Texto/link pegado por el usuario (no pude navegarlo en vivo, analiza solo lo que dice):\n${texto}` });
      resumenPartes.push(texto.length > 300 ? texto.slice(0, 300) + "…" : texto);
    }

    if (pdfBase64) {
      const base64 = pdfBase64.includes(",") ? pdfBase64.split(",")[1] : pdfBase64;
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64 },
      });
      resumenPartes.push("[PDF adjunto]");
    }

    if (imagenBase64) {
      const match = imagenBase64.match(/^data:(image\/\w+);base64,(.*)$/);
      const mediaType = (match?.[1] ?? "image/jpeg") as "image/jpeg" | "image/png" | "image/webp" | "image/gif";
      const base64 = match ? match[2] : imagenBase64;
      content.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: base64 },
      });
      resumenPartes.push("[Foto adjunta]");
    }

    if (content.length === 0) {
      return new Response(JSON.stringify({ error: "No se recibió VIN, texto, PDF ni imagen para analizar." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    content.push({ type: "text", text: "Da tu análisis y veredicto siguiendo el formato indicado (o responde directo si es una pregunta de comparación)." });

    const { data: historialRows } = await supabase
      .from("manheim_chat")
      .select("role,contenido")
      .order("created_at", { ascending: true })
      .limit(MAX_HISTORIAL);

    const historyMessages: Anthropic.MessageParam[] = (historialRows ?? []).map((r) => ({
      role: r.role as "user" | "assistant",
      content: r.contenido,
    }));

    const response = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      system: SYSTEM_PROMPT,
      messages: [...historyMessages, { role: "user", content }],
    });

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    const analisis = textBlock?.text ?? "(sin respuesta de texto)";

    const contenidoUsuario = resumenPartes.join("\n") || "(auto compartido)";
    await supabase.from("manheim_chat").insert([
      { role: "user", contenido: contenidoUsuario },
      { role: "assistant", contenido: analisis },
    ]);

    if (prospecto) {
      await supabase
        .from("manheim_prospectos")
        .update({ analisis_ia: analisis, analisis_ia_at: new Date().toISOString() })
        .eq("vin", prospecto.vin);
    }

    const { data: thread } = await supabase
      .from("manheim_chat")
      .select("role,contenido,created_at")
      .order("created_at", { ascending: true });

    return new Response(JSON.stringify({ ok: true, analisis, thread }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
