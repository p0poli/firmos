using System;
using System.Windows;
using System.Windows.Input;

namespace FirmOS.Revit
{
    /// <summary>
    /// Code-behind for <see cref="LoginDialog"/>.
    /// Async login is marshalled onto the UI thread via Dispatcher so progress
    /// feedback (button text, error label) stays responsive.
    /// </summary>
    public partial class LoginDialog : Window
    {
        public LoginDialog()
        {
            InitializeComponent();
            Loaded += (_, __) => EmailBox.Focus();
        }

        // ---- Event handlers --------------------------------------------------

        private async void ConnectBtn_Click(object sender, RoutedEventArgs e) =>
            await TryLoginAsync();

        private async void Input_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Return)
                await TryLoginAsync();
        }

        private void CloseBtn_Click(object sender, RoutedEventArgs e) =>
            DialogResult = false;

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

            if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
            {
                ShowError("Please enter your email and password.");
                return;
            }

            SetBusy(true);
            HideError();

            try
            {
                await ApiClient.Instance.LoginAsync(email, password);
                DialogResult = true;   // closes the dialog; caller checks IsLoggedIn()
            }
            catch (Exception ex)
            {
                ShowError(GetFriendlyError(ex));
            }
            finally
            {
                SetBusy(false);
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
            var msg = ex.InnerException?.Message ?? ex.Message;
            if (msg.Contains("401") || msg.Contains("403"))
                return "Incorrect email or password.";
            if (msg.Contains("connect") || msg.Contains("network") || msg.Contains("timeout"))
                return "Could not reach Vitruvius. Check your internet connection.";
            return $"Login failed: {msg}";
        }
    }
}
