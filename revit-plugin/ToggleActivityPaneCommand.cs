using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace FirmOS.Revit
{
    /// <summary>
    /// IExternalCommand that shows/hides the Model Activity dockable pane.
    /// Bound to the "Activity" ribbon button in the "Panels" panel.
    /// </summary>
    [Transaction(TransactionMode.ReadOnly)]
    public class ToggleActivityPaneCommand : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            try
            {
                var uiApp = commandData.Application;
                var pane  = uiApp.GetDockablePane(ActivityDockablePanel.PaneId);

                if (pane.IsShown())
                    pane.Hide();
                else
                    pane.Show();

                return Result.Succeeded;
            }
            catch (System.Exception ex)
            {
                FirmOSApp.LogException("ToggleActivityPaneCommand", ex);
                message = ex.Message;
                return Result.Failed;
            }
        }
    }
}
