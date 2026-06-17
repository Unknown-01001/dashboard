import { getSupabaseClient } from "./supabase.js";
import { ROUTES } from "../../config/routes.js";

export async function getSession() {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    window.location.href = ROUTES.login;
    return null;
  }
  return session;
}

export async function redirectIfAuthenticated() {
  const session = await getSession();
  if (session) window.location.href = ROUTES.dashboard;
}

export async function loginWithPassword(email, password) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function registerStudent({ email, password, name, study }) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name,
        study
      }
    }
  });

  if (error) throw error;
  return data;
}

export async function requestPasswordReset(email) {
  const supabase = await getSupabaseClient();
  const redirectTo = `${location.origin}${ROUTES.forgotPassword.startsWith("/") ? ROUTES.forgotPassword : `/${ROUTES.forgotPassword}`}`;
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
  return data;
}

export async function updateCurrentPassword(password) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  return data;
}

export async function logout() {
  const supabase = await getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function adminRequest(method, payload = {}) {
  const session = await getSession();
  if (!session?.access_token) throw new Error("Sesion no valida.");

  const response = await fetch("/api/admin-users", {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "No se pudo completar la accion administrativa.");
  return result;
}
