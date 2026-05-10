using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace FirmOS.Revit
{
    /// <summary>
    /// IExternalCommand that opens the Quick Task Logger dialog.
    /// Bound to the "Log Work" ribbon button in the "Work" panel.
    /// </summary>
    [Transaction(TransactionMode.ReadOnly)]
    public class TaskLoggerCommand : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            try
            {
                if (!ApiClient.Instance.IsLoggedIn())
                {
                    TaskDialog.Show("Vitruvius",
                        "Please connect to Vitruvius first (Connect panel).");
                    return Result.Cancelled;
                }

                var dialog = new TaskLoggerDialog();
                dialog.ShowDialog();
                return Result.Succeeded;
            }
            catch (System.Exception ex)
            {
                FirmOSApp.LogException("TaskLoggerCommand", ex);
                message = ex.Message;
                return Result.Failed;
            }
        }
    }
}
