import { getSession } from "./services/authService.js";
import { ROUTES } from "../config/routes.js";
import { loadingView, errorView } from "./components/loading.js";

const app = document.querySelector("#app");
document.body.dataset.theme = localStorage.getItem("notasUniversitariasTheme") || "dark";
app.innerHTML = loadingView("Verificando sesion...");

try {
  const session = await getSession();
  window.location.href = session ? ROUTES.dashboard : ROUTES.login;
} catch (error) {
  app.innerHTML = errorView("No se pudo conectar", error.message);
}
