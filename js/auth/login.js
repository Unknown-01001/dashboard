import { ROUTES } from "../../config/routes.js";
import { loginWithPassword } from "../services/authService.js";
import { showToast } from "../components/toast.js";
import { redirectAuthenticatedUsers } from "./session.js";

document.body.dataset.theme = localStorage.getItem("notasUniversitariasTheme") || "dark";
await safeBoot();

async function safeBoot() {
  try {
    await redirectAuthenticatedUsers();
  } catch (error) {
    showToast(error.message);
  }
}

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);

  try {
    await loginWithPassword(
      String(formData.get("email")).trim(),
      String(formData.get("password"))
    );
    window.location.href = ROUTES.dashboard;
  } catch (error) {
    showToast(error.message);
  }
});
