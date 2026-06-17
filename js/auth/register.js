import { ROUTES } from "../../config/routes.js";
import { registerStudent } from "../services/authService.js";
import { ensureProfile, upsertProfile } from "../services/database.js";
import { showToast } from "../components/toast.js";
import { redirectAuthenticatedUsers } from "./session.js";
import { ROLES } from "../../config/constants.js";

document.body.dataset.theme = localStorage.getItem("notasUniversitariasTheme") || "dark";
await safeBoot();

async function safeBoot() {
  try {
    await redirectAuthenticatedUsers();
  } catch (error) {
    showToast(error.message);
  }
}

document.querySelector("#registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const payload = {
    name: String(formData.get("name")).trim(),
    email: String(formData.get("email")).trim(),
    password: String(formData.get("password")),
    study: String(formData.get("study") || "").trim()
  };

  try {
    const result = await registerStudent(payload);
    if (result.session?.user) {
      await upsertProfile({
        id: result.session.user.id,
        email: payload.email,
        full_name: payload.name,
        role: ROLES.STUDENT,
        study: payload.study
      });
      await ensureProfile(result.session.user);
      window.location.href = ROUTES.dashboard;
      return;
    }
    showToast("Cuenta creada. Revisa tu correo si Supabase pide confirmacion.");
  } catch (error) {
    showToast(error.message);
  }
});
