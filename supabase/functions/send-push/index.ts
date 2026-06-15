import webPush from "npm:web-push@3";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { titulo, cuerpo, datos } = await req.json();

    const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:josephdpelayo@gmail.com";

    webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: suscripciones } = await supabase
      .from("push_suscripciones")
      .select("endpoint, p256dh, auth");

    if (!suscripciones?.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, msg: "Sin suscripciones" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.stringify({ titulo, cuerpo, datos: datos ?? {} });

    const results = await Promise.allSettled(
      suscripciones.map((s) =>
        webPush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        )
      )
    );

    // Limpiar suscripciones expiradas (410 Gone / 404)
    const expirados: string[] = results
      .map((r, i) =>
        r.status === "rejected" &&
        ([410, 404].includes((r.reason as { statusCode?: number })?.statusCode ?? 0))
          ? suscripciones[i].endpoint
          : null
      )
      .filter((x): x is string => x !== null);

    if (expirados.length > 0) {
      await supabase.from("push_suscripciones").delete().in("endpoint", expirados);
    }

    const enviados = results.filter((r) => r.status === "fulfilled").length;

    return new Response(
      JSON.stringify({ ok: true, sent: enviados, total: suscripciones.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
