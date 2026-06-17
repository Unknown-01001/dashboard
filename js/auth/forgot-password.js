import { ROUTES } from "../../config/routes.js";
import { requestPasswordReset, updateCurrentPassword } from "../services/authService.js";
import { getSupabaseClient } from "../services/supabase.js";
import { showToast } from "../components/toast.js";

document.body.dataset.theme = localStorage.getItem("notasUniversitariasTheme") || "dark";

const forgotForm = document.querySelector("#forgotPasswordForm");
const updateForm = document.querySelector("#updatePasswordForm");

try {
  const supabase = await getSupabaseClient();
  supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      forgotForm.classList.add("hidden");
      updateForm.classList.remove("hidden");
    }
  });
} catch (error) {
  showToast(error.message);
}

forgotForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = String(new FormData(event.currentTarget).get("email")).trim();

  try {
    await requestPasswordReset(email);
    showToast("Correo de recuperacion enviado.");
  } catch (error) {
    showToast(error.message);
  }
});

updateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = String(new FormData(event.currentTarget).get("password"));

  try {
    await updateCurrentPassword(password);
    showToast("Clave actualizada.");
    window.location.href = ROUTES.dashboard;
  } catch (error) {
    showToast(error.message);
  }
});
