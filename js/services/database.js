import { DEFAULTS, ROLES, TABLES } from "../../config/constants.js";
import { getSupabaseClient } from "./supabase.js";

export async function ensureProfile(authUser) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLES.PROFILES)
    .select("*")
    .eq("id", authUser.id)
    .maybeSingle();

  if (error) throw error;
  if (data) return mapProfile(data);

  const payload = {
    id: authUser.id,
    email: authUser.email,
    full_name: authUser.user_metadata?.full_name || authUser.email?.split("@")[0] || "Alumno",
    role: ROLES.STUDENT,
    study: authUser.user_metadata?.study || "",
    active_semester_id: null,
    selected_subject_id: null
  };

  const { data: inserted, error: insertError } = await supabase
    .from(TABLES.PROFILES)
    .insert(payload)
    .select()
    .single();

  if (insertError) throw insertError;
  return mapProfile(inserted);
}

export async function upsertProfile(payload) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase
    .from(TABLES.PROFILES)
    .upsert(payload, { onConflict: "id" });

  if (error) throw error;
}

export async function updateProfile(profileId, patch) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLES.PROFILES)
    .update(patch)
    .eq("id", profileId)
    .select()
    .single();

  if (error) throw error;
  return mapProfile(data);
}

export async function loadProfiles() {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLES.PROFILES)
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []).map(mapProfile);
}

export async function loadStudentData(userId) {
  const supabase = await getSupabaseClient();
  const [semestersResult, subjectsResult, evaluationsResult] = await Promise.all([
    supabase.from(TABLES.SEMESTERS).select("*").eq("user_id", userId).order("created_at", { ascending: true }),
    supabase.from(TABLES.SUBJECTS).select("*").eq("user_id", userId).order("created_at", { ascending: true }),
    supabase.from(TABLES.EVALUATIONS).select("*").eq("user_id", userId).order("created_at", { ascending: true })
  ]);

  if (semestersResult.error) throw semestersResult.error;
  if (subjectsResult.error) throw subjectsResult.error;
  if (evaluationsResult.error) throw evaluationsResult.error;

  const evaluations = (evaluationsResult.data || []).map(mapEvaluation);
  const subjects = (subjectsResult.data || []).map((row) => ({
    ...mapSubject(row),
    evaluations: evaluations.filter((evaluation) => evaluation.subjectId === row.id)
  }));

  return (semestersResult.data || []).map((row) => ({
    ...mapSemester(row),
    subjects: subjects.filter((subject) => subject.semesterId === row.id)
  }));
}

export async function createSemester(userId, name) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLES.SEMESTERS)
    .insert({ user_id: userId, name })
    .select()
    .single();

  if (error) throw error;
  return mapSemester(data);
}

export async function createSubject(userId, semesterId, values) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLES.SUBJECTS)
    .insert({
      user_id: userId,
      semester_id: semesterId,
      name: values.name,
      presentation_percent: values.presentationPercent,
      exam_percent: values.examPercent,
      approval_grade: values.approvalGrade,
      exemption_enabled: false,
      exemption_grade: DEFAULTS.exemptionGrade,
      exam_grade: null,
      simulation_exam_grade: DEFAULTS.simulationExamGrade
    })
    .select()
    .single();

  if (error) throw error;
  return mapSubject(data);
}

export async function updateSubject(userId, subjectId, patch) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase
    .from(TABLES.SUBJECTS)
    .update(patch)
    .eq("id", subjectId)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function deleteSubject(userId, subjectId) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase
    .from(TABLES.SUBJECTS)
    .delete()
    .eq("id", subjectId)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function clearSemester(userId, semesterId) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase
    .from(TABLES.SUBJECTS)
    .delete()
    .eq("semester_id", semesterId)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function createEvaluation(userId, subjectId, values) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase
    .from(TABLES.EVALUATIONS)
    .insert({
      user_id: userId,
      subject_id: subjectId,
      name: values.name,
      type: values.type,
      weight: values.weight,
      grade: values.grade
    });

  if (error) throw error;
}

export async function updateEvaluation(userId, evaluationId, patch) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase
    .from(TABLES.EVALUATIONS)
    .update(patch)
    .eq("id", evaluationId)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function deleteEvaluation(userId, evaluationId) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase
    .from(TABLES.EVALUATIONS)
    .delete()
    .eq("id", evaluationId)
    .eq("user_id", userId);

  if (error) throw error;
}

export function mapProfile(row) {
  return {
    id: row.id,
    email: row.email || "",
    name: row.full_name || row.email || "Usuario",
    role: row.role === ROLES.ADMIN ? ROLES.ADMIN : ROLES.STUDENT,
    study: row.study || "",
    activeSemesterId: row.active_semester_id || null,
    selectedSubjectId: row.selected_subject_id || null
  };
}

function mapSemester(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name || "Semestre sin nombre",
    subjects: []
  };
}

function mapSubject(row) {
  return {
    id: row.id,
    userId: row.user_id,
    semesterId: row.semester_id,
    name: row.name || "Asignatura sin nombre",
    presentationPercent: Number(row.presentation_percent ?? DEFAULTS.presentationPercent),
    examPercent: Number(row.exam_percent ?? DEFAULTS.examPercent),
    approvalGrade: Number(row.approval_grade ?? DEFAULTS.approvalGrade),
    exemptionEnabled: Boolean(row.exemption_enabled),
    exemptionGrade: Number(row.exemption_grade ?? DEFAULTS.exemptionGrade),
    examGrade: row.exam_grade === null || row.exam_grade === undefined ? null : Number(row.exam_grade),
    simulationExamGrade: Number(row.simulation_exam_grade ?? DEFAULTS.simulationExamGrade),
    evaluations: []
  };
}

function mapEvaluation(row) {
  return {
    id: row.id,
    userId: row.user_id,
    subjectId: row.subject_id,
    name: row.name || "Evaluacion",
    type: row.type || "Teorico",
    weight: Number(row.weight ?? 0),
    grade: Number(row.grade ?? 1)
  };
}
