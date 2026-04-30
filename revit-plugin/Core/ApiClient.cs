using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;

namespace FirmOS.Core
{
    /// <summary>
    /// HTTP client that talks to the FirmOS backend. JWT is stored locally
    /// at %AppData%\FirmOS\token.json so the plugin can resume across Revit sessions.
    /// </summary>
    public class ApiClient
    {
        private readonly HttpClient _http;
        private string _token;

        public string BaseUrl { get; }

        private static string TokenPath => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "FirmOS",
            "token.json"
        );

        public ApiClient(string baseUrl)
        {
            BaseUrl = baseUrl ?? throw new ArgumentNullException(nameof(baseUrl));
            _http = new HttpClient { BaseAddress = new Uri(baseUrl) };
            _http.DefaultRequestHeaders.Accept.Add(
                new MediaTypeWithQualityHeaderValue("application/json")
            );
        }

        public bool HasToken => !string.IsNullOrEmpty(_token);

        public void LoadStoredToken()
        {
            if (!File.Exists(TokenPath)) return;
            var token = File.ReadAllText(TokenPath).Trim();
            if (!string.IsNullOrEmpty(token)) ApplyToken(token);
        }

        public void SaveToken(string token)
        {
            var dir = Path.GetDirectoryName(TokenPath);
            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
            File.WriteAllText(TokenPath, token);
            ApplyToken(token);
        }

        public void ClearToken()
        {
            _token = null;
            _http.DefaultRequestHeaders.Authorization = null;
            if (File.Exists(TokenPath)) File.Delete(TokenPath);
        }

        private void ApplyToken(string token)
        {
            _token = token;
            _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        public Task<string> SendModelEventAsync(object payload) =>
            PostJsonAsync("/revit/event", payload);

        public Task<string> SendCheckResultAsync(object payload) =>
            PostJsonAsync("/revit/check", payload);

        private async Task<string> PostJsonAsync(string path, object payload)
        {
            var json = JsonConvert.SerializeObject(payload);
            using (var content = new StringContent(json, Encoding.UTF8, "application/json"))
            using (var resp = await _http.PostAsync(path, content).ConfigureAwait(false))
            {
                var body = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
                if (!resp.IsSuccessStatusCode)
                {
                    throw new HttpRequestException(
                        $"POST {path} failed ({(int)resp.StatusCode}): {body}"
                    );
                }
                return body;
            }
        }
    }
}
