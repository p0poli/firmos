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
