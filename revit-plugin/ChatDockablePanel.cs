using System;
using System.Windows;
using Autodesk.Revit.UI;

namespace FirmOS.Revit
{
    /// <summary>
    /// Registers the AI Chat dockable pane with Revit.
    ///
    /// The pane GUID must remain stable — if it changes Revit will treat it as
    /// a different pane and users will lose their dock layout.
    /// </summary>
    public class ChatDockablePanel : IDockablePaneProvider
    {
        // Stable GUID — do NOT change after first deployment.
        public static readonly DockablePaneId PaneId =
            new DockablePaneId(new Guid("7A3F2B1C-4E5D-4A6B-9C8E-1D2F3A4B5C6D"));

        private ChatPaneContent _content;

        // ---- IDockablePaneProvider -------------------------------------------

        public void SetupDockablePane(DockablePaneProviderData data)
        {
            _content         = new ChatPaneContent();
            data.FrameworkElement = _content;

            // Default dock: right side, minimum 240 px wide
            data.InitialState = new DockablePaneState
            {
                DockPosition        = DockPosition.Right,
                MinimumWidth        = 280,
                MinimumHeight       = 200,
            };
        }

        /// <summary>
        /// Exposes the content so ToggleChatPaneCommand can tell it to reset
        /// the token injection flag when the user signs out.
        /// </summary>
        public ChatPaneContent Content => _content;
    }
}
