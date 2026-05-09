using System.Collections.Generic;
using System.Windows;
using System.Windows.Input;

namespace FirmOS.Revit
{
    /// <summary>
    /// Code-behind for <see cref="ProjectSelectDialog"/>.
    /// Caller passes a list of <see cref="ProjectResponse"/> objects; after the
    /// user confirms, <see cref="SelectedProject"/> holds their choice.
    /// </summary>
    public partial class ProjectSelectDialog : Window
    {
        public ProjectResponse SelectedProject { get; private set; }

        public ProjectSelectDialog(IEnumerable<ProjectResponse> projects)
        {
            InitializeComponent();
            ProjectCombo.ItemsSource = projects;
        }

        // ---- Event handlers --------------------------------------------------

        private void ProjectCombo_SelectionChanged(object sender,
            System.Windows.Controls.SelectionChangedEventArgs e)
        {
            ConfirmBtn.IsEnabled = ProjectCombo.SelectedItem != null;
        }

        private void ConfirmBtn_Click(object sender, RoutedEventArgs e)
        {
            SelectedProject = ProjectCombo.SelectedItem as ProjectResponse;
            DialogResult    = true;
        }

        private void CancelBtn_Click(object sender, RoutedEventArgs e) =>
            DialogResult = false;

        private void TitleBar_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left)
                DragMove();
        }
    }
}
