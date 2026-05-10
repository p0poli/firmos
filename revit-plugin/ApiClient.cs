using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace FirmOS.Revit
{
    /// <summary>
    /// Singleton HTTP client that talks to the Vitruvius backend.
    /// Token and base-URL are persisted in %APPDATA%\Vitruvius\config.json.
    /// All calls are logged to %APPDATA%\Vitruvius\startup_log.txt.
    /// </summary>
    public sealed class ApiClient
    {
        // ---- Singleton --------------------------------------------------------

        private static readonly Lazy<ApiClient> _instance =
            new Lazy<ApiClient>(() => new ApiClient());

        public static ApiClient Instance => _instance.Value;

        // ---- Fields -----------------------------------------------------------

        private readonly HttpClient _http;
        private readonly string     _configPath;

        // Used for *serialising* outgoing request bodies (camelCase keys).
        private readonly JsonSerializerSettings _serializeSettings = new JsonSerializerSettings
        {
            ContractResolver  = new CamelCasePropertyNamesContractResolver(),
            NullValueHandling = NullValueHandling.Ignore,
        };

        // Newtonsoft.Json deserialises case-insensitively by default, so no
        // special settings are needed for incoming responses.

        private VitruviusConfig _config;

        // ---- Constructor (private) -------------------------------------------

        private ApiClient()
        {
            _configPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "Vitruvius",
                "config.json");

            _config = LoadConfig();

            _http = new HttpClient
            {
                BaseAddress = new Uri(_config.BaseUrl.TrimEnd('/') + "/"),
                Timeout     = TimeSpan.FromSeconds(30),
            };
            _http.DefaultRequestHeaders.Accept.Add(
                new MediaTypeWithQualityHeaderValue("application/json"));

            ApplyToken();

            Log($"ApiClient initialised — base URL: {_http.BaseAddress}");
        }

        // ---- Public API -------------------------------------------------------

        public bool IsLoggedIn() =>
            !string.IsNullOrWhiteSpace(_config?.AccessToken);

        /// <summary>Returns the stored JWT (null if not logged in).</summary>
        public string GetAccessToken() => _config?.AccessToken;

        /// <summary>
        /// POST /auth/login  {"email": "…", "password": "…"}
        /// On success, persists the JWT to config.json and sets the
        /// Authorization header for all subsequent requests.
        /// Throws <see cref="HttpRequestException"/> with the server's error
        /// body included in the message on any non-2xx response.
        /// </summary>
        public async Task LoginAsync(string email, string password)
        {
            // Build JSON body — Content-Type: application/json
            var requestBody = new LoginRequest { Email = email, Password = password };
            var json        = JsonConvert.SerializeObject(requestBody, _serializeSettings);
            var content     = new StringContent(json, Encoding.UTF8, "application/json");

            // Resolve and log the full URL so we can confirm it is correct.
            var fullUrl = new Uri(_http.BaseAddress!, "auth/login").ToString();
            Log($"LoginAsync ▶ POST {fullUrl}");
            Log($"  Request body: {json}");

            HttpResponseMessage resp;
            try
            {
                resp = await _http.PostAsync("auth/login", content).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                Log($"LoginAsync ✗ network error: {ex.Message}");
                throw;
            }

            var responseBody = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
            Log($"  Response {(int)resp.StatusCode}: {responseBody}");

            if (!resp.IsSuccessStatusCode)
                throw new HttpRequestException(
                    $"HTTP {(int)resp.StatusCode} from {fullUrl}: {responseBody}");

            var result = JsonConvert.DeserializeObject<LoginResponse>(responseBody);
            if (result?.AccessToken == null)
                throw new InvalidOperationException(
                    $"Login succeeded but response contained no access_token. Body: {responseBody}");

            _config.AccessToken = result.AccessToken;
            _config.Email       = email;
            SaveConfig();
            ApplyToken();

            Log("LoginAsync ◀ succeeded — token stored.");
        }

        /// <summary>Returns all projects visible to the authenticated user.</summary>
        public async Task<List<ProjectResponse>> GetProjectsAsync()
        {
            var fullUrl = new Uri(_http.BaseAddress!, "projects/").ToString();
            Log($"GetProjectsAsync ▶ GET {fullUrl}");

            HttpResponseMessage resp;
            try
            {
                resp = await _http.GetAsync("projects/").ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                Log($"GetProjectsAsync ✗ network error: {ex.Message}");
                throw;
            }

            var responseBody = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
            Log($"  Response {(int)resp.StatusCode}: {Truncate(responseBody, 300)}");

            if (!resp.IsSuccessStatusCode)
                throw new HttpRequestException(
                    $"HTTP {(int)resp.StatusCode} from {fullUrl}: {responseBody}");

            return JsonConvert.DeserializeObject<List<ProjectResponse>>(responseBody)
                   ?? new List<ProjectResponse>();
        }

        // -----------------------------------------------------------------------
        // Task + presence API methods (for dockable panels + task logger)
        // -----------------------------------------------------------------------

        /// <summary>Returns tasks assigned to the current user.</summary>
        public async Task<List<TaskItem>> GetMyTasksAsync(Guid? projectId)
        {
            var url = projectId.HasValue
                ? $"tasks/my?project_id={projectId}"
                : "tasks/my";

            Log($"GetMyTasksAsync ▶ GET {url}");
            HttpResponseMessage resp;
            try { resp = await _http.GetAsync(url).ConfigureAwait(false); }
            catch (Exception ex)
            {
                Log($"GetMyTasksAsync ✗ network error: {ex.Message}");
                return new List<TaskItem>();
            }

            var body = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
            Log($"GetMyTasksAsync ◀ {(int)resp.StatusCode}: {Truncate(body, 500)}");

            if (!resp.IsSuccessStatusCode)
            {
                Log($"GetMyTasksAsync ✗ non-2xx — returning empty list");
                return new List<TaskItem>();
            }

            var items = JsonConvert.DeserializeObject<List<TaskItem>>(body) ?? new List<TaskItem>();
            Log($"GetMyTasksAsync ◀ {items.Count} task(s) parsed");
            return items;
        }

        /// <summary>Returns online users for the current firm.</summary>
        public async Task<List<OnlineUserItem>> GetOnlineUsersAsync()
        {
            Log("GetOnlineUsersAsync ▶ GET sessions/online");
            HttpResponseMessage resp;
            try { resp = await _http.GetAsync("sessions/online").ConfigureAwait(false); }
            catch (Exception ex) { Log($"GetOnlineUsersAsync ✗ {ex.Message}"); return new List<OnlineUserItem>(); }

            var body = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
            if (!resp.IsSuccessStatusCode) { Log($"GetOnlineUsersAsync ✗ {(int)resp.StatusCode}"); return new List<OnlineUserItem>(); }
            return JsonConvert.DeserializeObject<List<OnlineUserItem>>(body) ?? new List<OnlineUserItem>();
        }

        /// <summary>Returns project health data for use in the Activity panel.</summary>
        public async Task<ProjectActivityData> GetProjectActivityAsync(Guid projectId)
        {
            var url = $"management/project-health";
            Log($"GetProjectActivityAsync ▶ GET {url}");
            HttpResponseMessage resp;
            try { resp = await _http.GetAsync(url).ConfigureAwait(false); }
            catch (Exception ex) { Log($"GetProjectActivityAsync ✗ {ex.Message}"); return null; }

            var body = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
            if (!resp.IsSuccessStatusCode) return null;

            var list = JsonConvert.DeserializeObject<List<ProjectActivityData>>(body);
            return list?.Find(p => p.Id == projectId);
        }

        /// <summary>POST /tasks/{id}/log — log work against a task (manual entry).</summary>
        public async Task LogWorkAsync(Guid taskId, int durationMinutes, string notes)
        {
            var payload = new TaskLogRequest
            {
                DurationMinutes = durationMinutes,
                Notes           = string.IsNullOrWhiteSpace(notes) ? null : notes,
                LoggedAt        = DateTime.UtcNow.ToString("o"),
            };
            var json    = JsonConvert.SerializeObject(payload, _serializeSettings);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var url     = $"tasks/{taskId}/log";

            Log($"LogWorkAsync ▶ POST {url}");
            var resp = await _http.PostAsync(url, content).ConfigureAwait(false);
            var body = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
            Log($"  Response {(int)resp.StatusCode}: {Truncate(body, 200)}");

            if (!resp.IsSuccessStatusCode)
                throw new HttpRequestException($"HTTP {(int)resp.StatusCode}: {body}");
        }

        /// <summary>POST /tasks/{id}/timelog — log a timed session (started_at → ended_at).</summary>
        public async Task LogWorkTimedAsync(
            Guid taskId,
            DateTime startedAt,
            DateTime endedAt,
            int durationMinutes,
            string notes)
        {
            var payload = new TimeLogRequest
            {
                StartedAt       = startedAt.ToString("o"),
                EndedAt         = endedAt.ToString("o"),
                DurationMinutes = durationMinutes,
                Notes           = string.IsNullOrWhiteSpace(notes) ? null : notes,
            };
            var json    = JsonConvert.SerializeObject(payload, _serializeSettings);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var url     = $"tasks/{taskId}/timelog";

            Log($"LogWorkTimedAsync ▶ POST {url} ({durationMinutes} min)");
            var resp = await _http.PostAsync(url, content).ConfigureAwait(false);
            var body = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
            Log($"  Response {(int)resp.StatusCode}: {Truncate(body, 200)}");

            if (!resp.IsSuccessStatusCode)
                throw new HttpRequestException($"HTTP {(int)resp.StatusCode}: {body}");
        }

        /// <summary>GET /tasks/{id}/timelogs/total — total logged minutes for a task.</summary>
        public async Task<int> GetTaskTimeTotalAsync(Guid taskId)
        {
            var url = $"tasks/{taskId}/timelogs/total";
            HttpResponseMessage resp;
            try { resp = await _http.GetAsync(url).ConfigureAwait(false); }
            catch { return 0; }

            if (!resp.IsSuccessStatusCode) return 0;
            var body = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
            var data = JsonConvert.DeserializeObject<TimeLogTotal>(body);
            return data?.TotalMinutes ?? 0;
        }

        /// <summary>PATCH /tasks/{id} — set status to done.</summary>
        public async Task MarkTaskDoneAsync(Guid taskId)
        {
            var json    = "{\"status\":\"done\"}";
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var url     = $"tasks/{taskId}";

            Log($"MarkTaskDoneAsync ▶ PATCH {url}");
            var resp = await _http.PatchAsync(url, content).ConfigureAwait(false);
            Log($"  Response {(int)resp.StatusCode}");

            if (!resp.IsSuccessStatusCode)
            {
                var body = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
                throw new HttpRequestException($"HTTP {(int)resp.StatusCode}: {body}");
            }
        }

        /// <summary>
        /// POST /revit/event  — fire-and-forget model lifecycle event.
        /// Never throws; logs failures so Revit is never crashed.
        /// </summary>
        public async Task SendModelEventAsync(ModelEventPayload payload)
        {
            try
            {
                var json    = JsonConvert.SerializeObject(payload, _serializeSettings);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                Log($"SendModelEventAsync ▶ POST revit/event ({payload.EventType})");
                var resp = await _http.PostAsync("revit/event", content).ConfigureAwait(false);
                var body = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
                Log($"  Response {(int)resp.StatusCode}: {Truncate(body, 200)}");
            }
            catch (Exception ex)
            {
                Log($"SendModelEventAsync ✗ {ex.Message}");
            }
        }

        // ---- Private helpers --------------------------------------------------

        private void ApplyToken()
        {
            _http.DefaultRequestHeaders.Authorization =
                string.IsNullOrWhiteSpace(_config?.AccessToken)
                    ? null
                    : new AuthenticationHeaderValue("Bearer", _config.AccessToken);
        }

        private VitruviusConfig LoadConfig()
        {
            try
            {
                if (File.Exists(_configPath))
                {
                    var cfg = JsonConvert.DeserializeObject<VitruviusConfig>(
                                  File.ReadAllText(_configPath));
                    if (cfg != null) return cfg;
                }
            }
            catch (Exception ex)
            {
                Log($"LoadConfig warning (corrupt file reset): {ex.Message}");
            }
            return new VitruviusConfig();
        }

        private void SaveConfig()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_configPath)!);
                File.WriteAllText(
                    _configPath,
                    JsonConvert.SerializeObject(_config, Formatting.Indented));
            }
            catch (Exception ex)
            {
                Log($"SaveConfig failed: {ex.Message}");
            }
        }

        // ---- Logging ----------------------------------------------------------
        // Reuses FirmOSApp.Log so everything goes to the same file.

        private static void Log(string message) =>
            FirmOSApp.Log($"[ApiClient] {message}");

        private static string Truncate(string s, int maxLen) =>
            s.Length <= maxLen ? s : s[..maxLen] + "…";
    }
}
