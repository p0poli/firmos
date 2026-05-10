using System;
using System.Windows.Controls;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace FirmOS.Revit
{
    /// <summary>
    /// The WPF UserControl that hosts a WebView2 pointing at the
    /// Vitruvius AI chat page ( https://p0poli.github.io/firmos/#/revit-chat ).
    ///
    /// After the WebView2 is initialised and the page finishes loading we inject
    /// the stored JWT into localStorage so the page can talk to the backend
    /// without asking the user to sign in again.
    /// </summary>
    public class ChatPaneContent : UserControl
    {
        private const string ChatUrl =
            "https://p0poli.github.io/firmos/#/revit-chat";

        private readonly WebView2 _webView;
        private bool _tokenInjected = false;

        public ChatPaneContent()
        {
            // WebView2 lives inside a simple Grid so it fills all available space.
            var grid = new System.Windows.Controls.Grid();
            _webView = new WebView2();
            grid.Children.Add(_webView);
            Content = grid;

            // Wire up async initialisation — must be done after the control is
            // added to a visual tree (or at least after the constructor).
            Loaded += OnLoaded;
        }

        private async void OnLoaded(object sender, System.Windows.RoutedEventArgs e)
        {
            try
            {
                await _webView.EnsureCoreWebView2Async();
                FirmOSApp.Log("[ChatPane] CoreWebView2 ready — navigating to chat URL");

                _webView.CoreWebView2.NavigationCompleted += OnNavigationCompleted;
                _webView.CoreWebView2.Navigate(ChatUrl);
            }
            catch (Exception ex)
            {
                FirmOSApp.LogException("[ChatPane] EnsureCoreWebView2Async", ex);
            }
        }

        private async void OnNavigationCompleted(
            object sender,
            CoreWebView2NavigationCompletedEventArgs e)
        {
            if (_tokenInjected) return;   // inject only once per load

            var token = ApiClient.Instance.GetAccessToken();
            if (string.IsNullOrWhiteSpace(token))
            {
                FirmOSApp.Log("[ChatPane] No token available yet — page loaded without injection");
                return;
            }

            try
            {
                // Escape the token to avoid XSS via weird JWT characters (none expected,
                // but this is defensive).
                var escaped = token.Replace("'", "\\'");
                var script  = $"localStorage.setItem('firmos_token', '{escaped}');";
                await _webView.CoreWebView2.ExecuteScriptAsync(script);
                FirmOSApp.Log("[ChatPane] JWT injected into localStorage");
                _tokenInjected = true;
            }
            catch (Exception ex)
            {
                FirmOSApp.LogException("[ChatPane] ExecuteScriptAsync", ex);
            }
        }

        /// <summary>
        /// Called when the user signs out so the next open starts fresh.
        /// </summary>
        public void ResetToken()
        {
            _tokenInjected = false;
        }
    }
}
