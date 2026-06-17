import { createClient } from "@supabase/supabase-js";

const ROLES = {
  STUDENT: "Alumno",
  ADMIN: "Administrador"
};

export default async function handler(request, response) {
  try {
    const env = readEnv();
    const caller = await getCallerProfile(request, env);

    if (caller.role !== ROLES.ADMIN) {
      return response.status(403).json({ error: "Solo un administrador puede gestionar usuarios." });
    }

    const body = parseBody(request.body);

    if (request.method === "POST") {
      const result = await createUser(body, env);
      return response.status(201).json(result);
    }

    if (request.method === "PATCH") {
      const result = await updateUser(body, env, caller);
      return response.status(200).json(result);
    }

    if (request.method === "DELETE") {
      const result = await deleteUser(body, env, caller);
      return response.status(200).json(result);
    }

    return response.status(405).json({ error: "Metodo no permitido." });
  } catch (error) {
    return response.status(error.statusCode || 500).json({ error: error.message });
  }
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "string") return JSON.parse(body || "{}");
  return body;
}

function readEnv() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw new HttpError("Faltan variables SUPABASE_URL, SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY.", 500);
  }

  return { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey };
}

async function getCallerProfile(request, env) {
  const token = String(request.headers.authorization || "").replace("Bearer ", "");
  if (!token) throw new HttpError("Falta token de sesion.", 401);

  const userClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false }
  });

  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) throw new HttpError("Sesion invalida.", 401);

  const service = serviceClient(env);
  const { data: profile, error } = await service
    .from("profiles")
    .select("id, role")
    .eq("id", authData.user.id)
    .single();

  if (error || !profile) throw new HttpError("Perfil administrador no encontrado.", 403);
  return profile;
}

async function createUser(payload, env) {
  const email = required(payload.email, "correo");
  const password = required(payload.password, "clave");
  const fullName = required(payload.full_name, "nombre");
  const role = payload.role === ROLES.ADMIN ? ROLES.ADMIN : ROLES.STUDENT;
  const study = role === ROLES.STUDENT ? String(payload.study || "") : "";
  const service = serviceClient(env);

  const { data: authData, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, study, role }
  });

  if (createError) throw createError;
  const userId = authData.user.id;

  const { error: profileError } = await service.from("profiles").upsert({
    id: userId,
    email,
    full_name: fullName,
    role,
    study,
    active_semester_id: null,
    selected_subject_id: null
  });

  if (profileError) throw profileError;

  if (role === ROLES.STUDENT && payload.semester_name) {
    await service.from("semestres").insert({
      user_id: userId,
      name: String(payload.semester_name)
    });
  }

  return { userId };
}

async function updateUser(payload, env, caller) {
  const id = required(payload.id, "id");
  const service = serviceClient(env);

  if (id === caller.id && payload.role && payload.role !== ROLES.ADMIN) {
    throw new HttpError("No puedes quitar tu propio rol administrador.", 400);
  }

  const authPatch = {};
  if (payload.email) authPatch.email = String(payload.email);
  if (payload.password) authPatch.password = String(payload.password);
  authPatch.user_metadata = {
    full_name: String(payload.full_name || ""),
    study: String(payload.study || ""),
    role: payload.role === ROLES.ADMIN ? ROLES.ADMIN : ROLES.STUDENT
  };

  const { error: authError } = await service.auth.admin.updateUserById(id, authPatch);
  if (authError) throw authError;

  const profilePatch = {
    email: payload.email ? String(payload.email) : undefined,
    full_name: String(payload.full_name || ""),
    role: payload.role === ROLES.ADMIN ? ROLES.ADMIN : ROLES.STUDENT,
    study: payload.role === ROLES.ADMIN ? "" : String(payload.study || "")
  };

  Object.keys(profilePatch).forEach((key) => profilePatch[key] === undefined && delete profilePatch[key]);

  const { error: profileError } = await service
    .from("profiles")
    .update(profilePatch)
    .eq("id", id);

  if (profileError) throw profileError;
  return { id };
}

async function deleteUser(payload, env, caller) {
  const id = required(payload.id, "id");
  if (id === caller.id) throw new HttpError("No puedes eliminar tu propia sesion.", 400);

  const service = serviceClient(env);
  const { data: admins, error: adminsError } = await service
    .from("profiles")
    .select("id")
    .eq("role", ROLES.ADMIN);

  if (adminsError) throw adminsError;
  if (admins.length <= 1 && admins.some((admin) => admin.id === id)) {
    throw new HttpError("Debe existir al menos un administrador.", 400);
  }

  const { error: deleteError } = await service.auth.admin.deleteUser(id, false);
  if (deleteError) throw deleteError;

  await service.from("profiles").delete().eq("id", id);
  return { id };
}

function serviceClient(env) {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false }
  });
}

function required(value, label) {
  if (!value) throw new HttpError(`Falta ${label}.`, 400);
  return String(value).trim();
}

class HttpError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}
