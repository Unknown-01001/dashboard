import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

let client = null;

export async function getSupabaseClient() {
  if (client) return client;

  const config = await loadSupabaseConfig();
  client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  });

  return client;
}

async function loadSupabaseConfig() {
  const localConfig = window.SUPABASE_CONFIG || {};
  if (isValidConfig(localConfig)) return localConfig;

  if (location.protocol.startsWith("http")) {
    const response = await fetch("/api/config");
    if (response.ok) {
      const apiConfig = await response.json();
      if (isValidConfig(apiConfig)) return apiConfig;
    }
  }

  throw new Error("Falta configurar Supabase. En Vercel agrega SUPABASE_URL y SUPABASE_ANON_KEY. En local edita config.js.");
}

function isValidConfig(config) {
  return Boolean(
    config?.supabaseUrl &&
    config?.supabaseAnonKey &&
    !config.supabaseUrl.includes("TU-PROYECTO") &&
    !config.supabaseAnonKey.includes("TU_SUPABASE")
  );
}
