using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace FirmOS.Revit
{
    /// <summary>
    /// IExternalCommand that shows/hides the AI Chat dockable pane.
    /// Bound to the "AI Assistant" ribbon button in the "Panels" panel.
    /// </summary>
    [Transaction(TransactionMode.ReadOnly)]
    public class ToggleChatPaneCommand : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            try
            {
                var uiApp = commandData.Application;
                var pane  = uiApp.GetDockablePane(ChatDockablePanel.PaneId);

                if (pane.IsShown())
                    pane.Hide();
                else
                    pane.Show();

                return Result.Succeeded;
            }
            catch (System.Exception ex)
            {
                FirmOSApp.LogException("ToggleChatPaneCommand", ex);
                message = ex.Message;
                return Result.Failed;
            }
        }
    }
}
