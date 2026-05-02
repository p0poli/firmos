import axios from "axios";

// Default to the live Render backend so production builds work without
// any extra env config. Override with REACT_APP_API_URL=http://localhost:8000
// (or whatever) for local development — CRA reads this at build time.
const baseURL =
  process.env.REACT_APP_API_URL || "https://firmos-backend.onrender.com";

const api = axios.create({ baseURL });

const TOKEN_KEY = "firmos_token";
const SESSION_KEY = "firmos_session_id";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const getSessionId = () => localStorage.getItem(SESSION_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const setSessionId = (id) => localStorage.setItem(SESSION_KEY, id);
export const clearAuth = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(SESSION_KEY);
};

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

export default api;
