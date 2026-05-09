using System;
using System.Windows;
using System.Windows.Input;

namespace FirmOS.Revit
{
    /// <summary>
    /// Code-behind for <see cref="LoginDialog"/>.
    /// All login steps are logged to %APPDATA%\Vitruvius\startup_log.txt.
    /// </summary>
    public partial class LoginDialog : Window
    {
        public LoginDialog()
        {
            Log("LoginDialog constructor ▶ calling InitializeComponent()");
            try
            {
                InitializeComponent();
                Log("LoginDialog constructor ◀ InitializeComponent() succeeded");
            }
            catch (Exception ex)
            {
                FirmOSApp.LogException("LoginDialog.InitializeComponent", ex);
                throw;   // re-throw so ConnectCommand sees and logs it too
            }

            Loaded += (_, __) =>
            {
                Log("LoginDialog Loaded — focusing EmailBox");
                EmailBox.Focus();
            };
        }

        // ---- Event handlers --------------------------------------------------

        private async void ConnectBtn_Click(object sender, RoutedEventArgs e)
        {
            Log("Connect button clicked");
            await TryLoginAsync();
        }

        private async void Input_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Return)
            {
                Log("Enter key pressed in input field");
                await TryLoginAsync();
            }
        }

        private void CloseBtn_Click(object sender, RoutedEventArgs e)
        {
            Log("LoginDialog close button clicked — DialogResult = false");
            DialogResult = false;
        }

        private void TitleBar_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left)
                DragMove();
        }

        // ---- Login logic -----------------------------------------------------

        private async System.Threading.Tasks.Task TryLoginAsync()
        {
            var email    = EmailBox.Text.Trim();
            var password = PasswordBox.Password;

            Log($"TryLoginAsync ▶ email='{email}' password={( string.IsNullOrEmpty(password) ? "(empty)" : $"({password.Length} chars)")}");

            if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
            {
                Log("TryLoginAsync ◀ validation failed (empty email or password)");
                ShowError("Please enter your email and password.");
                return;
            }

            SetBusy(true);
            HideError();

            try
            {
                Log($"Calling ApiClient.Instance.LoginAsync(email='{email}')...");
                await ApiClient.Instance.LoginAsync(email, password);
                Log("LoginAsync returned successfully — setting DialogResult = true");
                DialogResult = true;
            }
            catch (Exception ex)
            {
                // Log full exception BEFORE converting to friendly message.
                FirmOSApp.LogException("LoginDialog.TryLoginAsync", ex);

                var friendly = GetFriendlyError(ex);
                Log($"Showing friendly error: '{friendly}'");
                ShowError(friendly);
            }
            finally
            {
                SetBusy(false);
                Log("TryLoginAsync ◀ complete");
            }
        }

        // ---- Helpers ---------------------------------------------------------

        private void SetBusy(bool busy)
        {
            ConnectBtn.IsEnabled  = !busy;
            EmailBox.IsEnabled    = !busy;
            PasswordBox.IsEnabled = !busy;
            ConnectBtn.Content    = busy ? "Connecting…" : "Connect";
        }

        private void ShowError(string msg)
        {
            ErrorLabel.Text       = msg;
            ErrorLabel.Visibility = Visibility.Visible;
        }

        private void HideError() =>
            ErrorLabel.Visibility = Visibility.Collapsed;

        private static string GetFriendlyError(Exception ex)
        {
            // Walk the full inner-exception chain for the most specific message.
            var msg = ex.Message;
            for (var inner = ex.InnerException; inner != null; inner = inner.InnerException)
                msg = inner.Message;

            if (msg.Contains("401") || msg.Contains("403") ||
                msg.Contains("Incorrect") || msg.Contains("invalid"))
                return "Incorrect email or password.";

            if (msg.Contains("404"))
                return $"Endpoint not found (404). Check the server URL.\n\nDetails: {msg}";

            if (msg.Contains("connect") || msg.Contains("network") ||
                msg.Contains("timeout") || msg.Contains("refused"))
                return "Could not reach Vitruvius. Check your internet connection.";

            return $"Login failed: {msg}";
        }

        private static void Log(string msg) =>
            FirmOSApp.Log($"[LoginDialog] {msg}");
    }
}
