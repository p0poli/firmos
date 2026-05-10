using System;
using System.Windows;
using Autodesk.Revit.UI;

namespace FirmOS.Revit
{
    /// <summary>
    /// Registers the Model Activity dockable pane with Revit.
    /// </summary>
    public class ActivityDockablePanel : IDockablePaneProvider
    {
        // Stable GUID — do NOT change after first deployment.
        public static readonly DockablePaneId PaneId =
            new DockablePaneId(new Guid("2C4E6A8B-1D3F-4B7C-8E9A-0F1C2D3E4F5A"));

        private ActivityPaneContent _content;

        public void SetupDockablePane(DockablePaneProviderData data)
        {
            _content              = new ActivityPaneContent();
            data.FrameworkElement = _content;

            data.InitialState = new DockablePaneState
            {
                DockPosition   = DockPosition.Right,
                MinimumWidth   = 260,
                MinimumHeight  = 200,
            };
        }

        /// <summary>
        /// Forwards a project change notification to the pane content.
        /// Called from FirmOSApp.OnDocumentOpened.
        /// </summary>
        public void NotifyProjectChanged(Guid projectId)
        {
            _content?.SetProject(projectId);
        }
    }
}
