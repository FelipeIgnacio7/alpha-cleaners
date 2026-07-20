// Edge Function: trae insights de la cuenta publicitaria de Meta (Facebook/Instagram Ads)
// Requiere los secrets META_ADS_TOKEN y META_AD_ACCOUNT_ID configurados en el proyecto.
// El token nunca llega al navegador: la app llama a esta función, y esta llama a Meta.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GRAPH_VERSION = 'v21.0'
const META_TOKEN = Deno.env.get('META_ADS_TOKEN')
const AD_ACCOUNT_ID = Deno.env.get('META_AD_ACCOUNT_ID') // formato: act_560001791296296

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!META_TOKEN || !AD_ACCOUNT_ID) {
    return new Response(
      JSON.stringify({ error: 'Faltan los secrets META_ADS_TOKEN o META_AD_ACCOUNT_ID en el proyecto' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const url = new URL(req.url)
    const datePreset = url.searchParams.get('date_preset') || 'last_7d'
    const level = url.searchParams.get('level') || 'campaign'

    const fields = 'campaign_name,spend,impressions,clicks,ctr,cpc,reach,actions'
    const metaUrl =
      `https://graph.facebook.com/${GRAPH_VERSION}/${AD_ACCOUNT_ID}/insights` +
      `?level=${level}&date_preset=${datePreset}&fields=${fields}&access_token=${META_TOKEN}`

    const res = await fetch(metaUrl)
    const data = await res.json()

    if (data.error) {
      return new Response(JSON.stringify({ error: data.error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
