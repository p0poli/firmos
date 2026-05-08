import axios from "axios";

// Default to the live Render backend so production builds work without
// any extra env config. Override with REACT_APP_API_URL=http://localhost:8000
// (or whatever) for local development — CRA reads this at build time.
const baseURL =
  process.env.REACT_APP_API_URL || "https://firmos-backend.onrender.com";

const api = axios.create({ baseURL });

const TOKEN_KEY   = "firmos_token";
const SESSION_KEY = "firmos_session_id";
const ROLE_KEY    = "firmos_role";
const MODULES_KEY = "firmos_modules";

export const getToken     = () => localStorage.getItem(TOKEN_KEY);
export const getSessionId = () => localStorage.getItem(SESSION_KEY);
export const setToken     = (token) => localStorage.setItem(TOKEN_KEY, token);
export const setSessionId = (id) => localStorage.setItem(SESSION_KEY, id);

/** Read the cached role (written at login-time from the JWT payload). */
export const getRole = () => localStorage.getItem(ROLE_KEY) || "architect";

/** Read the cached module list (written at login-time). */
export const getStoredModules = () => {
  try {
    return JSON.parse(localStorage.getItem(MODULES_KEY) || "[]");
  } catch {
    return [];
  }
};

/** Persist the module list so UserContext can hydrate without an extra fetch. */
export const setStoredModules = (data) =>
  localStorage.setItem(MODULES_KEY, JSON.stringify(data));

export const clearAuth = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(MODULES_KEY);
};

/**
 * Decode a JWT payload without verifying the signature.
 * Used only for reading the `role` claim for UI routing — the server
 * re-validates the token on every request.
 */
export function decodeJwt(token) {
  try {
    const segment = token.split(".")[1];
    const padded  = segment + "=".repeat((4 - (segment.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      clearAuth();
      if (!window.location.hash.startsWith("#/login")) {
        window.location.hash = "#/login";
      }
    }
    return Promise.reject(err);
  }
);

export const login = async (email, password) => {
  const { data } = await api.post("/auth/login", { email, password });
  setToken(data.access_token);
  setSessionId(data.session_id);

  // Decode the role claim and cache it so UserContext can render the right
  // dashboard variant immediately without a round-trip.
  const payload = decodeJwt(data.access_token);
  if (payload?.role) {
    localStorage.setItem(ROLE_KEY, payload.role);
  }

  // Pre-warm the module cache; non-blocking, failures are safe to ignore.
  getModules()
    .then(setStoredModules)
    .catch(() => {});

  return data;
};

export const logout = async () => {
  try {
    await api.post("/auth/logout");
  } finally {
    clearAuth();
  }
};

export const getMe = () => api.get("/users/me").then((r) => r.data);

export const listProjects = (status) =>
  api
    .get("/projects/", { params: status ? { status } : {} })
    .then((r) => r.data);
export const getProject = (id) =>
  api.get(`/projects/${id}`).then((r) => r.data);
export const getProjectTasks = (id) =>
  api.get(`/projects/${id}/tasks`).then((r) => r.data);
export const updateTask = (id, payload) =>
  api.patch(`/tasks/${id}`, payload).then((r) => r.data);
export const getProjectFiles = (id) =>
  api.get(`/projects/${id}/files`).then((r) => r.data);
export const getProjectInsights = (id) =>
  api.get(`/projects/${id}/insights`).then((r) => r.data);
export const getProjectChecks = (id, limit = 50) =>
  api
    .get(`/projects/${id}/checks`, { params: { limit } })
    .then((r) => r.data);
export const generateInsights = (id) =>
  api.post(`/insights/generate/${id}`).then((r) => r.data);

export const getMySessions = () =>
  api.get("/sessions/me").then((r) => r.data);
export const getActiveSessions = () =>
  api.get("/sessions/active").then((r) => r.data);
export const setSessionProject = (sessionId, projectId) =>
  api
    .patch(`/sessions/${sessionId}/project`, { project_id: projectId })
    .then((r) => r.data);

export const getRecentChecks = (limit = 10) =>
  api.get("/revit/checks/recent", { params: { limit } }).then((r) => r.data);
export const getRecentInsights = (limit = 10) =>
  api.get("/insights/recent", { params: { limit } }).then((r) => r.data);

export const getKnowledgeGraph = () =>
  api.get("/knowledge/graph").then((r) => r.data);

// --- users ----------------------------------------------------------------

/** List all users in the caller's firm. Admin only. */
export const listUsers = () =>
  api.get("/users/").then((r) => r.data);

/**
 * Create a new user in the caller's firm. Admin only.
 * payload: { name, email, password, role }
 */
export const createUser = (payload) =>
  api.post("/users/", payload).then((r) => r.data);

/**
 * Update a team member's role. Admin only.
 * role ∈ { "admin" | "project_manager" | "architect" }
 */
export const updateUserRole = (userId, role) =>
  api.patch(`/users/${userId}/role`, { role }).then((r) => r.data);

// --- modules --------------------------------------------------------------

/**
 * Toggle a firm module on or off. Admin only.
 * Returns the updated FirmModuleOut.
 */
export const updateModule = (moduleKey, isActive) =>
  api.patch(`/modules/${moduleKey}`, { is_active: isActive }).then((r) => r.data);

// --- firm settings (AI provider + key) ------------------------------------

/**
 * Fetch current firm AI settings. Admin only.
 * Returns { ai_provider, has_custom_key }.
 */
export const getFirmSettings = () =>
  api.get("/settings/").then((r) => r.data);

/**
 * Switch the firm's AI provider. Admin only.
 * provider ∈ { "anthropic" | "openai" }
 */
export const updateAiProvider = (provider) =>
  api.patch("/settings/ai-provider", { provider }).then((r) => r.data);

/**
 * Encrypt + store (or clear) a per-firm API key. Admin only.
 * Pass an empty string to clear the stored key.
 */
export const updateAiKey = (apiKey) =>
  api.patch("/settings/ai-key", { api_key: apiKey }).then((r) => r.data);

// --- Vitruvius / modules ---------------------------------------------------

/** Fetch all firm modules (key, display_name, is_active, activated_at). */
export const getModules = () =>
  api.get("/modules/").then((r) => r.data);

/**
 * Free-form chat with Vitruvius.
 * Returns { answer, used_provider, used_key_source }.
 */
export const askVitruvius = (prompt, projectIds = []) =>
  api
    .post("/insights/ask", { prompt, project_ids: projectIds })
    .then((r) => r.data);

/**
 * Fetch firm-wide insights (admin-only endpoint).
 * Returns InsightWithProjectOut[].
 */
export const getFirmInsights = (limit = 20) =>
  api.get("/insights/firm/", { params: { limit } }).then((r) => r.data);

/**
 * Generate a typed insight for a project.
 * type ∈ { "progress_summary" | "delay_risk" | "bottleneck" }
 */
export const generateInsight = (projectId, type) =>
  api
    .post(`/insights/generate/${projectId}`, null, { params: { type } })
    .then((r) => r.data);

// --- conversations / memory -----------------------------------------------

/**
 * Send a user message and receive the assistant response.
 * Returns { message_id, content, created_at }.
 */
export const sendChatMessage = (content, projectId = null) =>
  api
    .post("/conversations/message", {
      content,
      project_id: projectId || null,
    })
    .then((r) => r.data);

/**
 * Fetch conversation history for the current user.
 * Returns HistoryMessageOut[] ordered by created_at asc.
 */
export const getChatHistory = (projectId = null, limit = 100) =>
  api
    .get("/conversations/history", {
      params: { project_id: projectId || undefined, limit },
    })
    .then((r) => r.data);

/**
 * Anonymize a message and contribute it to the firm knowledge pool.
 * Returns { memory_chunk_id, anonymized_preview }.
 */
export const shareConversationMessage = (messageId) =>
  api.post(`/conversations/${messageId}/share`).then((r) => r.data);

/**
 * Soft-delete a firm memory contribution (sets is_active=false).
 * Returns { success: true }.
 */
export const withdrawContribution = (chunkId) =>
  api.delete(`/conversations/memory/${chunkId}/withdraw`).then((r) => r.data);

/**
 * List all MemoryChunks contributed by the current user.
 * Returns ContributionOut[].
 */
export const getMyContributions = () =>
  api.get("/conversations/my-contributions").then((r) => r.data);

export default api;
