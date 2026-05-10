using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Media;
using System.Windows.Threading;

namespace FirmOS.Revit
{
    /// <summary>
    /// Quick Task Logger dialog.
    ///
    /// Two states:
    ///   STATE 1 (idle)   — large timer "00:00:00", green [▶ Start Timer] button,
    ///                      manual duration stepper visible below divider.
    ///   STATE 2 (running) — timer ticks green, "Started at HH:mm", red [⏹ Stop &amp; Log],
    ///                       manual section hidden, task combo disabled.
    ///
    /// System tray icon appears when the timer is running and the dialog is minimized.
    /// Closing while timer is running prompts the user.
    /// </summary>
    public partial class TaskLoggerDialog : Window
    {
        // ── Timer state ────────────────────────────────────────────────────────
        private DispatcherTimer   _displayTimer;   // 1-second UI tick
        private DateTime          _startTime;
        private bool              _isRunning = false;
        private bool              _userConfirmedClose = false;

        // ── Task list ──────────────────────────────────────────────────────────
        private List<TaskItem> _tasks;

        // ── System tray ───────────────────────────────────────────────────────
        private VitruviusTrayIcon _tray;

        // ── Green / white brushes ─────────────────────────────────────────────
        private static readonly SolidColorBrush GreenBrush =
            new SolidColorBrush(Color.FromRgb(0x22, 0xc5, 0x5e));
        private static readonly SolidColorBrush WhiteBrush =
            new SolidColorBrush(Colors.White);

        public TaskLoggerDialog()
        {
            InitializeComponent();
            Loaded += OnLoaded;

            // Initialise display timer (not started yet)
            _displayTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
            _displayTimer.Tick += (_, __) => UpdateTimerDisplay();
        }

        // ── Load ──────────────────────────────────────────────────────────────

        private async void OnLoaded(object sender, RoutedEventArgs e)
        {
            SetState(running: false);
            SetStatus("Loading tasks…");

            try
            {
                _tasks = await ApiClient.Instance.GetMyTasksAsync(null);

                if (_tasks == null || _tasks.Count == 0)
                {
                    NoTasksHint.Visibility = Visibility.Visible;
                    LogBtn.IsEnabled       = false;
                    StartStopBtn.IsEnabled = false;
                    SetStatus("");
                    return;
                }

                TaskCombo.ItemsSource   = _tasks;
                TaskCombo.SelectedIndex = 0;
                SetStatus("");
            }
            catch (Exception ex)
            {
                FirmOSApp.LogException("[TaskLogger] OnLoaded", ex);
                SetStatus("Failed to load tasks.");
            }
        }

        // ── Timer core ────────────────────────────────────────────────────────

        private void StartTimer()
        {
            _startTime  = DateTime.Now;
            _isRunning  = true;

            _displayTimer.Start();
            SetState(running: true);

            StartedAtLabel.Text       = $"Started at {_startTime:hh:mm tt}";
            StartedAtLabel.Visibility = Visibility.Visible;

            FirmOSApp.Log($"[TaskLogger] Timer started at {_startTime:HH:mm:ss}");
        }

        private async Task StopAndLogAsync()
        {
            if (!_isRunning) return;

            var endTime = DateTime.Now;
            var elapsed = endTime - _startTime;
            var durationMinutes = (int)Math.Ceiling(elapsed.TotalMinutes);
            if (durationMinutes < 1) durationMinutes = 1;

            _displayTimer.Stop();
            _isRunning = false;
            SetState(running: false);

            var task = TaskCombo.SelectedItem as TaskItem;
            if (task == null) return;

            LogBtn.IsEnabled = false;
            SetStatus("Logging…");

            try
            {
                await ApiClient.Instance.LogWorkTimedAsync(
                    task.Id, _startTime, endTime, durationMinutes, NotesBox.Text.Trim());

                if (MarkDoneCheck.IsChecked == true)
                    await ApiClient.Instance.MarkTaskDoneAsync(task.Id);

                ShowToast($"✓ Logged {FormatDuration(durationMinutes)} to \"{task.Title}\"");

                // Reset display
                TimerDisplay.Text       = "00:00:00";
                TimerDisplay.Foreground = WhiteBrush;
                StartedAtLabel.Visibility = Visibility.Collapsed;

                FirmOSApp.Log($"[TaskLogger] Logged {durationMinutes} min to {task.Title}");
            }
            catch (Exception ex)
            {
                FirmOSApp.LogException("[TaskLogger] StopAndLogAsync", ex);
                SetStatus("Log failed — check connection.");
            }
            finally
            {
                LogBtn.IsEnabled = true;
                DisposeTray();
            }
        }

        // ── UI state switching ────────────────────────────────────────────────

        private void SetState(bool running)
        {
            if (running)
            {
                // STATE 2 — running
                TaskCombo.IsEnabled       = false;
                StartStopBtn.Style        = (Style)FindResource("StopBtn");
                StartStopBtn.Content      = "⏹  Stop & Log";
                DividerRow.Visibility     = Visibility.Collapsed;
                ManualSection.Visibility  = Visibility.Collapsed;
                LogBtn.IsEnabled          = false;
                SubtitleLabel.Text        = "Timer is running…";
            }
            else
            {
                // STATE 1 — idle
                TaskCombo.IsEnabled       = true;
                StartStopBtn.Style        = (Style)FindResource("StartBtn");
                StartStopBtn.Content      = "▶  Start Timer";
                StartedAtLabel.Visibility = Visibility.Collapsed;
                DividerRow.Visibility     = Visibility.Visible;
                ManualSection.Visibility  = Visibility.Visible;
                LogBtn.IsEnabled          = true;
                SubtitleLabel.Text        = "Start the timer or enter a duration manually.";
            }
        }

        private void UpdateTimerDisplay()
        {
            if (!_isRunning) return;
            var elapsed = DateTime.Now - _startTime;
            TimerDisplay.Text       = elapsed.ToString(@"hh\:mm\:ss");
            TimerDisplay.Foreground = GreenBrush;
        }

        // ── Button handlers ───────────────────────────────────────────────────

        private async void StartStopBtn_Click(object sender, RoutedEventArgs e)
        {
            if (_isRunning)
            {
                DisposeTray();
                await StopAndLogAsync();
            }
            else
            {
                if (TaskCombo.SelectedItem == null) return;
                StartTimer();
            }
        }

        private void MinusBtn_Click(object sender, RoutedEventArgs e)
        {
            if (int.TryParse(DurationBox.Text, out var v))
                DurationBox.Text = Math.Max(5, v - 5).ToString();
        }

        private void PlusBtn_Click(object sender, RoutedEventArgs e)
        {
            if (int.TryParse(DurationBox.Text, out var v))
                DurationBox.Text = Math.Min(600, v + 5).ToString();
        }

        private async void LogBtn_Click(object sender, RoutedEventArgs e)
        {
            // Manual log (timer not running)
            var task = TaskCombo.SelectedItem as TaskItem;
            if (task == null) return;

            if (!int.TryParse(DurationBox.Text, out var duration) || duration <= 0)
            {
                MessageBox.Show("Please enter a valid duration.", "Vitruvius",
                    MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            LogBtn.IsEnabled = false;
            SetStatus("Logging…");

            try
            {
                // For manual entry use now-duration as start, now as end
                var endTime   = DateTime.Now;
                var startTime = endTime - TimeSpan.FromMinutes(duration);

                await ApiClient.Instance.LogWorkTimedAsync(
                    task.Id, startTime, endTime, duration, NotesBox.Text.Trim());

                if (MarkDoneCheck.IsChecked == true)
                    await ApiClient.Instance.MarkTaskDoneAsync(task.Id);

                ShowToast($"✓ Logged {FormatDuration(duration)} to \"{task.Title}\"");
            }
            catch (Exception ex)
            {
                FirmOSApp.LogException("[TaskLogger] LogBtn_Click", ex);
                SetStatus("Log failed — check connection.");
            }
            finally
            {
                LogBtn.IsEnabled = true;
            }
        }

        private void CancelBtn_Click(object sender, RoutedEventArgs e)
        {
            if (_isRunning)
            {
                // Prompt user before discarding running timer
                PromptTimerRunning(allowClose: true);
            }
            else
            {
                _userConfirmedClose = true;
                Close();
            }
        }

        // ── Window closing ────────────────────────────────────────────────────

        private void Window_Closing(object sender, CancelEventArgs e)
        {
            if (_userConfirmedClose || !_isRunning)
            {
                _displayTimer.Stop();
                DisposeTray();
                return;
            }

            e.Cancel = true;   // don't close yet
            PromptTimerRunning(allowClose: true);
        }

        private void PromptTimerRunning(bool allowClose)
        {
            var elapsed   = DateTime.Now - _startTime;
            var formatted = elapsed.ToString(@"hh\:mm\:ss");
            var taskName  = (TaskCombo.SelectedItem as TaskItem)?.Title ?? "current task";

            var result = MessageBox.Show(
                $"The timer is still running ({formatted} on \"{taskName}\").\n\n" +
                "[Yes] Stop & Log  [No] Discard timer  [Cancel] Keep running",
                "Timer Running — Vitruvius",
                MessageBoxButton.YesNoCancel,
                MessageBoxImage.Question,
                MessageBoxResult.Yes);

            // Yes = Stop & Log, No = Discard, Cancel = Keep Running
            if (result == MessageBoxResult.Yes)
            {
                // Stop & Log then close
                _ = StopAndLogThenClose();
            }
            else if (result == MessageBoxResult.No)
            {
                // Discard
                _displayTimer.Stop();
                _isRunning = false;
                _userConfirmedClose = true;
                DisposeTray();
                Close();
            }
            else
            {
                // Keep Running — minimize to tray
                EnsureTray();
                Hide();
            }
        }

        private async Task StopAndLogThenClose()
        {
            await StopAndLogAsync();
            await Task.Delay(2000);   // let toast show briefly
            _userConfirmedClose = true;
            Close();
        }

        // ── Toast ─────────────────────────────────────────────────────────────

        private async void ShowToast(string message)
        {
            ToastLabel.Text         = message;
            ToastBorder.Visibility  = Visibility.Visible;

            await Task.Delay(3000);

            ToastBorder.Visibility = Visibility.Collapsed;
        }

        private void SetStatus(string text)
        {
            // Use subtitle label for inline status while keeping layout stable
            if (!string.IsNullOrEmpty(text))
                SubtitleLabel.Text = text;
        }

        // ── System tray ───────────────────────────────────────────────────────

        private void EnsureTray()
        {
            if (_tray != null) return;

            var taskName = (TaskCombo.SelectedItem as TaskItem)?.Title ?? "task";

            _tray = new VitruviusTrayIcon(
                onStopAndLog: () => Dispatcher.Invoke(async () =>
                {
                    Show();
                    Activate();
                    DisposeTray();
                    await StopAndLogAsync();
                }),
                onSwitchTask: () => Dispatcher.Invoke(() =>
                {
                    Show();
                    Activate();
                    DisposeTray();
                }),
                onReopen: () => Dispatcher.Invoke(() => { Show(); Activate(); }),
                getTooltip: () =>
                {
                    var elapsed = DateTime.Now - _startTime;
                    return $"⏱ {elapsed:hh\\:mm\\:ss} on {taskName} — Vitruvius";
                }
            );
        }

        private void DisposeTray()
        {
            _tray?.Dispose();
            _tray = null;
        }

        // ── Helpers ───────────────────────────────────────────────────────────

        private static string FormatDuration(int minutes)
        {
            var h = minutes / 60;
            var m = minutes % 60;
            if (h > 0 && m > 0) return $"{h}h {m}m";
            if (h > 0)           return $"{h}h";
            return $"{m}m";
        }
    }
}
