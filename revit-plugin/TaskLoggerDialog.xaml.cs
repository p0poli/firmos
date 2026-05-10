using System;
using System.Collections.Generic;
using System.Windows;

namespace FirmOS.Revit
{
    /// <summary>
    /// Code-behind for the Quick Task Logger dialog.
    ///
    /// Flow:
    ///   1. Constructor fetches tasks assigned to the current user.
    ///   2. User picks a task, sets duration (stepper), optionally adds notes.
    ///   3. "Log Work" calls POST /tasks/{id}/log + optionally PATCH status=done.
    /// </summary>
    public partial class TaskLoggerDialog : Window
    {
        private List<TaskItem> _tasks;

        public TaskLoggerDialog()
        {
            InitializeComponent();
            Loaded += OnLoaded;
        }

        private async void OnLoaded(object sender, RoutedEventArgs e)
        {
            try
            {
                SetStatus("Loading tasks…", false);
                _tasks = await ApiClient.Instance.GetMyTasksAsync(null);

                if (_tasks == null || _tasks.Count == 0)
                {
                    NoTasksHint.Visibility = Visibility.Visible;
                    LogBtn.IsEnabled = false;
                    SetStatus("", false);
                    return;
                }

                TaskCombo.ItemsSource    = _tasks;
                TaskCombo.SelectedIndex  = 0;
                SetStatus("", false);
            }
            catch (Exception ex)
            {
                FirmOSApp.LogException("[TaskLogger] OnLoaded", ex);
                SetStatus("Failed to load tasks.", false);
            }
        }

        // ---- Stepper ----------------------------------------------------------

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

        // ---- Task selection ---------------------------------------------------

        private void TaskCombo_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
        {
            // Nothing needed; selection is read at submit time.
        }

        // ---- Submit -----------------------------------------------------------

        private async void LogBtn_Click(object sender, RoutedEventArgs e)
        {
            var task = TaskCombo.SelectedItem as TaskItem;
            if (task == null) return;

            if (!int.TryParse(DurationBox.Text, out var duration) || duration <= 0)
            {
                MessageBox.Show("Please enter a valid duration.", "Vitruvius",
                    MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            SetStatus("Logging…", true);
            LogBtn.IsEnabled = false;

            try
            {
                await ApiClient.Instance.LogWorkAsync(task.Id, duration, NotesBox.Text.Trim());

                if (MarkDoneCheck.IsChecked == true)
                    await ApiClient.Instance.MarkTaskDoneAsync(task.Id);

                DialogResult = true;
                Close();
            }
            catch (Exception ex)
            {
                FirmOSApp.LogException("[TaskLogger] LogBtn_Click", ex);
                SetStatus("Failed — check connection.", false);
                LogBtn.IsEnabled = true;
            }
        }

        private void CancelBtn_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = false;
            Close();
        }

        // ---- Helpers ----------------------------------------------------------

        private void SetStatus(string text, bool visible)
        {
            StatusLabel.Text       = text;
            StatusLabel.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;
        }
    }
}
