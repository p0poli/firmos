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
        private readonly JsonSerializerSettings _json = new JsonSerializerSettings
        {
            ContractResolver      = new CamelCasePropertyNamesContractResolver(),
            NullValueHandling     = NullValueHandling.Ignore,
        };

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
        }

        // ---- Public API -------------------------------------------------------

        public bool IsLoggedIn() =>
            !string.IsNullOrWhiteSpace(_config?.AccessToken);

        /// <summary>
        /// Authenticates with the backend and persists the JWT to disk.
        /// Throws <see cref="HttpRequestException"/> on network error or 4xx/5xx.
        /// </summary>
        public async Task LoginAsync(string email, string password)
        {
            var body = Serialize(new LoginRequest { Email = email, Password = password });
            // OAuth2 password-grant endpoint
            var form = new FormUrlEncodedContent(new[]
            {
                new System.Collections.Generic.KeyValuePair<string,string>("username", email),
                new System.Collections.Generic.KeyValuePair<string,string>("password", password),
            });

            var resp = await _http.PostAsync("auth/token", form).ConfigureAwait(false);
            await EnsureSuccess(resp).ConfigureAwait(false);

            var result = await Deserialize<LoginResponse>(resp).ConfigureAwait(false);
            _config.AccessToken = result.AccessToken;
            _config.Email       = email;
            SaveConfig();
            ApplyToken();
        }

        /// <summary>Returns all projects visible to the authenticated user.</summary>
        public async Task<List<ProjectResponse>> GetProjectsAsync()
        {
            var resp = await _http.GetAsync("projects/").ConfigureAwait(false);
            await EnsureSuccess(resp).ConfigureAwait(false);
            return await Deserialize<List<ProjectResponse>>(resp).ConfigureAwait(false);
        }

        /// <summary>
        /// Posts a model-lifecycle event (opened / closed / synced) to the backend.
        /// Returns silently on failure so callers never crash Revit.
        /// </summary>
        public async Task SendModelEventAsync(ModelEventPayload payload)
        {
            try
            {
                var content = new StringContent(
                    JsonConvert.SerializeObject(payload, _json),
                    Encoding.UTF8, "application/json");

                var resp = await _http.PostAsync("revit/event", content).ConfigureAwait(false);
                await EnsureSuccess(resp).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                // Non-fatal — log to Revit journal and continue.
                System.Diagnostics.Trace.WriteLine($"[Vitruvius] SendModelEvent failed: {ex.Message}");
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
                    return JsonConvert.DeserializeObject<VitruviusConfig>(
                               File.ReadAllText(_configPath))
                           ?? new VitruviusConfig();
            }
            catch { /* corrupt file — start fresh */ }
            return new VitruviusConfig();
        }

        private void SaveConfig()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_configPath)!);
                File.WriteAllText(_configPath, JsonConvert.SerializeObject(_config, Formatting.Indented));
            }
            catch (Exception ex)
            {
                System.Diagnostics.Trace.WriteLine($"[Vitruvius] SaveConfig failed: {ex.Message}");
            }
        }

        private string Serialize(object obj) =>
            JsonConvert.SerializeObject(obj, _json);

        private static async Task<T> Deserialize<T>(HttpResponseMessage resp)
        {
            var json = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
            return JsonConvert.DeserializeObject<T>(json);
        }

        private static async Task EnsureSuccess(HttpResponseMessage resp)
        {
            if (!resp.IsSuccessStatusCode)
            {
                var body = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
                throw new HttpRequestException(
                    $"HTTP {(int)resp.StatusCode}: {body}");
            }
        }
    }
}
