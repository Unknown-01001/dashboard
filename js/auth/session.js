import { getSession, requireSession } from "../services/authService.js";
import { ensureProfile } from "../services/database.js";
import { ROUTES } from "../../config/routes.js";

export async function redirectAuthenticatedUsers() {
  const session = await getSession();
  if (session) window.location.href = ROUTES.dashboard;
}

export async function getAuthenticatedContext() {
  const session = await requireSession();
  if (!session) return null;
  const profile = await ensureProfile(session.user);
  return { session, profile };
}
