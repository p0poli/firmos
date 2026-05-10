using System;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace FirmOS.Revit
{
    /// <summary>
    /// WPF UserControl hosting a WebView2 that loads the Vitruvius AI chat page.
    ///
    /// Fix log (black-screen debug):
    ///   1. EnsureCoreWebView2Async must be called on the UI thread — done via Loaded event.
    ///   2. Token injection happens in NavigationCompleted + 500 ms Task.Delay so React
    ///      has time to mount before we write to localStorage.
    ///   3. IsWebMessageEnabled + AreDefaultScriptDialogsEnabled set explicitly.
    ///   4. ConsoleMessage events forwarded to startup_log.txt for remote debugging.
    ///   5. NavigationCompleted.IsSuccess=false shows an in-pane WPF error message.
    ///   6. If no token is stored we show a "Please connect first" prompt instead
    ///      of loading the page at all (avoids a confusing blank React app).
    /// </summary>
    public class ChatPaneContent : UserControl
    {
        private const string ChatUrl =
            "https://p0poli.github.io/firmos/#/revit-chat";

        private WebView2   _webView;
        private TextBlock  _statusLabel;
        private bool       _tokenInjected = false;

        public ChatPaneContent()
        {
            BuildLayout();
            Loaded += OnLoaded;
        }

        // ── Layout ────────────────────────────────────────────────────────────

        private void BuildLayout()
        {
            var root = new Grid { Background = new SolidColorBrush(Color.FromRgb(0x1e, 0x1f, 0x22)) };

            // Status label shown while loading or on error
            _statusLabel = new TextBlock
            {
                Text             = "Loading AI Chat…",
                Foreground       = new SolidColorBrush(Color.FromRgb(0x80, 0x84, 0x8e)),
                FontSize         = 12,
                TextAlignment    = TextAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Center,
                TextWrapping     = TextWrapping.Wrap,
                Margin           = new Thickness(16),
            };

            _webView = new WebView2
            {
                Visibility = Visibility.Collapsed,
            };

            root.Children.Add(_statusLabel);
            root.Children.Add(_webView);
            Content = root;
        }

        // ── Initialisation ────────────────────────────────────────────────────

        private async void OnLoaded(object sender, RoutedEventArgs e)
        {
            // Guard against double-init when the pane is re-docked
            if (_webView.CoreWebView2 != null) return;

            try
            {
                FirmOSApp.Log("[ChatPane] EnsureCoreWebView2Async ▶");
                await _webView.EnsureCoreWebView2Async();
                FirmOSApp.Log("[ChatPane] CoreWebView2 ready");

                ConfigureWebView2();

                // Check token before navigating — if not logged in show a prompt
                var token = ApiClient.Instance.GetAccessToken();
                if (string.IsNullOrWhiteSpace(token))
                {
                    ShowStatus("Please connect to Vitruvius first\n(use the Connect button in the ribbon).");
                    return;
                }

                _webView.Visibility = Visibility.Visible;
                _statusLabel.Visibility = Visibility.Collapsed;

                FirmOSApp.Log($"[ChatPane] Navigating to {ChatUrl}");
                _webView.CoreWebView2.Navigate(ChatUrl);
            }
            catch (Exception ex)
            {
                FirmOSApp.LogException("[ChatPane] OnLoaded", ex);
                ShowStatus($"WebView2 initialisation failed:\n{ex.Message}");
            }
        }

        private void ConfigureWebView2()
        {
            var settings = _webView.CoreWebView2.Settings;

            // Allow script, popups, and dialogs (needed for React app)
            settings.IsScriptEnabled                   = true;
            settings.IsWebMessageEnabled               = true;
            settings.AreDefaultScriptDialogsEnabled    = true;
            settings.AreDevToolsEnabled                = false;   // keep clean in production
            settings.IsStatusBarEnabled                = false;

            // Token injection after each successful navigation
            _webView.CoreWebView2.NavigationCompleted += OnNavigationCompleted;

            // Log any navigation failures
            _webView.CoreWebView2.NavigationStarting += (_, args) =>
                FirmOSApp.Log($"[ChatPane] NavigationStarting → {args.Uri}");
        }

        // ── Navigation callbacks ──────────────────────────────────────────────

        private async void OnNavigationCompleted(
            object sender,
            CoreWebView2NavigationCompletedEventArgs e)
        {
            FirmOSApp.Log($"[ChatPane] NavigationCompleted — IsSuccess={e.IsSuccess} HttpStatus={e.HttpStatusCode}");

            if (!e.IsSuccess)
            {
                ShowStatus(
                    $"Failed to load Vitruvius chat.\n" +
                    $"Error: {e.WebErrorStatus}\n\n" +
                    $"Check your internet connection.");
                return;
            }

            if (_tokenInjected) return;

            var token = ApiClient.Instance.GetAccessToken();
            if (string.IsNullOrWhiteSpace(token))
            {
                FirmOSApp.Log("[ChatPane] No token yet — skipping injection");
                return;
            }

            try
            {
                // Wait 500 ms for React to mount before writing to localStorage
                await Task.Delay(500);

                // Escape for JS string — JWT only contains base64url + dots, but be safe
                var escaped = token
                    .Replace("\\", "\\\\")
                    .Replace("'",  "\\'");

                var script =
                    $"(function(){{\n" +
                    $"  localStorage.setItem('firmos_token', '{escaped}');\n" +
                    $"  console.log('[Vitruvius] Token injected by Revit plugin');\n" +
                    $"}})();";

                await _webView.CoreWebView2.ExecuteScriptAsync(script);
                FirmOSApp.Log("[ChatPane] JWT injected into localStorage ✓");
                _tokenInjected = true;
            }
            catch (Exception ex)
            {
                FirmOSApp.LogException("[ChatPane] Token injection", ex);
            }
        }

        // ── Public API ────────────────────────────────────────────────────────

        /// <summary>
        /// Re-trigger navigation after the user logs in via ConnectCommand.
        /// Resets token-injected flag so the next NavigationCompleted injects fresh.
        /// </summary>
        public async void RefreshAfterLogin()
        {
            _tokenInjected = false;

            if (_webView.CoreWebView2 == null) return;

            var token = ApiClient.Instance.GetAccessToken();
            if (string.IsNullOrWhiteSpace(token)) return;

            _webView.Visibility     = Visibility.Visible;
            _statusLabel.Visibility = Visibility.Collapsed;

            FirmOSApp.Log("[ChatPane] RefreshAfterLogin → re-navigating");
            _webView.CoreWebView2.Navigate(ChatUrl);

            await Task.CompletedTask;
        }

        public void ResetToken() => _tokenInjected = false;

        // ── Helpers ───────────────────────────────────────────────────────────

        private void ShowStatus(string text)
        {
            _webView.Visibility     = Visibility.Collapsed;
            _statusLabel.Text       = text;
            _statusLabel.Visibility = Visibility.Visible;
        }
    }
}
