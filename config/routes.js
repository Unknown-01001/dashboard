const inPagesFolder = location.pathname.includes("/pages/");
const page = (file) => (inPagesFolder ? file : `pages/${file}`);

export const ROUTES = Object.freeze({
  home: inPagesFolder ? "../index.html" : "index.html",
  login: page("login.html"),
  register: page("register.html"),
  forgotPassword: page("forgot-password.html"),
  dashboard: page("dashboard.html"),
  profile: page("profile.html")
});

export function redirectTo(route) {
  window.location.href = route;
}
