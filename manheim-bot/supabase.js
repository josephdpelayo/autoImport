require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en manheim-bot/.env');
}

// service_role bypassa RLS: uso exclusivo de este script local, nunca exponer al cliente.
const sb = createClient(url, key, { auth: { persistSession: false } });

module.exports = { sb };
