using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;

namespace FirmOS.Revit
{
    /// <summary>
    /// Code-behind for the Model Activity dockable panel.
    ///
    /// Auto-refreshes every 60 seconds via a DispatcherTimer.
    /// All API calls are fire-and-forget with results marshalled back to the
    /// UI thread through Dispatcher.InvokeAsync.
    /// </summary>
    public partial class ActivityPaneContent : UserControl
    {
        private readonly DispatcherTimer _timer;
        private Guid _currentProjectId = Guid.Empty;

        public ActivityPaneContent()
        {
            InitializeComponent();

            _timer = new DispatcherTimer
            {
                Interval = TimeSpan.FromSeconds(60),
            };
            _timer.Tick += (_, __) => Refresh();

            Loaded   += (_, __) => { Refresh(); _timer.Start(); };
            Unloaded += (_, __) => _timer.Stop();
        }

        // ---- Public surface ---------------------------------------------------

        /// <summary>
        /// Called by FirmOSApp whenever the active project changes (DocumentOpened).
        /// </summary>
        public void SetProject(Guid projectId)
        {
            _currentProjectId = projectId;
            Refresh();
        }

        // ---- Refresh ----------------------------------------------------------

        private void Refresh()
        {
            ShowLoading(true);
            _ = RefreshAsync();
        }

        private async System.Threading.Tasks.Task RefreshAsync()
        {
            try
            {
                // Fire all three requests in parallel
                var taskProject = _currentProjectId != Guid.Empty
                    ? ApiClient.Instance.GetProjectActivityAsync(_currentProjectId)
                    : System.Threading.Tasks.Task.FromResult<ProjectActivityData>(null);

                var taskMyTasks  = ApiClient.Instance.GetMyTasksAsync(
                    _currentProjectId != Guid.Empty ? _currentProjectId : (Guid?)null);
                var taskOnline   = ApiClient.Instance.GetOnlineUsersAsync();

                await System.Threading.Tasks.Task.WhenAll(taskProject, taskMyTasks, taskOnline);

                var project = await taskProject;
                var myTasks = await taskMyTasks;
                var online  = await taskOnline;

                // Marshal to UI thread
                // Fetch time totals (off UI thread, before marshalling)
                await PopulateTasksAsync(myTasks);

                await Dispatcher.InvokeAsync(() =>
                {
                    PopulateProject(project);
                    // Tasks already populated by PopulateTasksAsync but we must
                    // set ItemsSource on the UI thread
                    if (myTasks == null || myTasks.Count == 0)
                    {
                        TasksList.ItemsSource   = null;
                        NoTasksLabel.Visibility = Visibility.Visible;
                    }
                    else
                    {
                        NoTasksLabel.Visibility = Visibility.Collapsed;
                        TasksList.ItemsSource   = myTasks.Count > 5
                            ? myTasks.GetRange(0, 5) : myTasks;
                    }
                    PopulateOnline(online);
                    LastRefreshLabel.Text = $"Last refreshed {DateTime.Now:HH:mm:ss}";
                    ShowLoading(false);
                });
            }
            catch (Exception ex)
            {
                FirmOSApp.LogException("[ActivityPane] RefreshAsync", ex);
                await Dispatcher.InvokeAsync(() =>
                {
                    ShowLoading(false);
                    LastRefreshLabel.Text = $"Refresh failed — {DateTime.Now:HH:mm}";
                });
            }
        }

        // ---- Populate helpers -------------------------------------------------

        private void PopulateProject(ProjectActivityData data)
        {
            if (data == null)
            {
                ProjectName.Text   = "No project linked";
                ProjectStatus.Text = "Open a mapped Revit file to see project data.";
                ProgressFill.Width = 0;
                ProgressLabel.Text = "";
                return;
            }

            ProjectName.Text   = data.Name;
            ProjectStatus.Text = $"{data.Status} · {data.MemberCount} members";

            var pct = data.TasksTotal > 0
                ? (double)data.TasksDone / data.TasksTotal
                : 0;

            // The parent border's ActualWidth gives us the track width.
            // Use 240 as a fallback if the layout hasn't run yet.
            double trackWidth = Math.Max(((FrameworkElement)ProgressFill.Parent).ActualWidth, 240);
            ProgressFill.Width = pct * trackWidth;
            ProgressLabel.Text  = $"{data.TasksDone}/{data.TasksTotal}";
        }

        private async System.Threading.Tasks.Task PopulateTasksAsync(List<TaskItem> tasks)
        {
            if (tasks == null || tasks.Count == 0)
            {
                TasksList.ItemsSource = null;
                NoTasksLabel.Visibility = Visibility.Visible;
                return;
            }

            // Fetch time totals in parallel for up to 5 tasks (avoid hammering the API)
            var slice = tasks.Count > 5 ? tasks.GetRange(0, 5) : tasks;
            var totals = await System.Threading.Tasks.Task.WhenAll(
                slice.ConvertAll(t =>
                    ApiClient.Instance.GetTaskTimeTotalAsync(t.Id)
                        .ContinueWith(r => (t, r.IsCompletedSuccessfully ? r.Result : 0))));

            foreach (var (task, minutes) in totals)
                task.TotalMinutes = minutes;

            NoTasksLabel.Visibility = Visibility.Collapsed;
            TasksList.ItemsSource   = slice;
        }

        private void PopulateOnline(List<OnlineUserItem> users)
        {
            if (users == null || users.Count == 0)
            {
                OnlineList.ItemsSource = null;
                NoOnlineLabel.Visibility = Visibility.Visible;
                return;
            }

            NoOnlineLabel.Visibility = Visibility.Collapsed;
            OnlineList.ItemsSource   = users;
        }

        private void ShowLoading(bool show)
        {
            LoadingLabel.Visibility = show ? Visibility.Visible : Visibility.Collapsed;
        }

        // ---- Button handlers --------------------------------------------------

        private void RefreshButton_Click(object sender, RoutedEventArgs e) => Refresh();
    }
}
