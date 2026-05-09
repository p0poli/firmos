using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace FirmOS.Revit
{
    /// <summary>
    /// "Connect to Vitruvius" ribbon button command.
    ///
    /// Flow
    /// ----
    ///   1. If the user is not logged in → show LoginDialog.
    ///   2. If the current file already has a project mapping → inform and exit.
    ///   3. Otherwise → fetch projects, show ProjectSelectDialog, save mapping.
    ///   4. Send an "opened" event for the current file immediately.
    /// </summary>
    [Transaction(TransactionMode.ReadOnly)]
    public class ConnectCommand : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            try
            {
                var doc = commandData.Application.ActiveUIDocument?.Document;
                if (doc == null || doc.IsFamilyDocument)
                {
                    TaskDialog.Show("Vitruvius", "Please open a project model first.");
                    return Result.Cancelled;
                }

                // ---- Step 1: ensure the user is logged in --------------------
                if (!ApiClient.Instance.IsLoggedIn())
                {
                    var login = new LoginDialog();
                    login.ShowDialog();
                    if (!ApiClient.Instance.IsLoggedIn())
                        return Result.Cancelled;   // user closed without logging in
                }

                // ---- Step 2: check existing mapping -------------------------
                var filePath  = GetFilePath(doc);
                var projectId = ProjectMatcher.Instance.GetProjectForFile(filePath);

                if (projectId != Guid.Empty)
                {
                    TaskDialog.Show(
                        "Vitruvius",
                        $"This file is already linked to a Vitruvius project.\n\n" +
                        $"Project ID: {projectId}");
                    return Result.Succeeded;
                }

                // ---- Step 3: pick a project ---------------------------------
                List<ProjectResponse> projects;
                try
                {
                    projects = Task.Run(() => ApiClient.Instance.GetProjectsAsync()).Result;
                }
                catch (Exception ex)
                {
                    TaskDialog.Show("Vitruvius", $"Could not load projects: {ex.Message}");
                    return Result.Failed;
                }

                if (projects == null || projects.Count == 0)
                {
                    TaskDialog.Show("Vitruvius",
                        "No projects found. Create a project on the Vitruvius dashboard first.");
                    return Result.Cancelled;
                }

                var picker = new ProjectSelectDialog(projects);
                if (picker.ShowDialog() != true || picker.SelectedProject == null)
                    return Result.Cancelled;

                // ---- Step 4: save mapping and send "opened" event -----------
                var selected = picker.SelectedProject;
                ProjectMatcher.Instance.SaveMapping(filePath, selected.Id);

                var payload = new ModelEventPayload
                {
                    EventType     = "opened",
                    Timestamp     = DateTime.UtcNow.ToString("o"),
                    RevitFileName = System.IO.Path.GetFileName(filePath),
                    RevitVersion  = GetRevitVersion(doc),
                    ProjectId     = selected.Id,
                };
                _ = ApiClient.Instance.SendModelEventAsync(payload);

                TaskDialog.Show(
                    "Vitruvius",
                    $"Connected!\n\n\"{System.IO.Path.GetFileName(filePath)}\" " +
                    $"is now linked to project \"{selected.Name}\".");

                return Result.Succeeded;
            }
            catch (Exception ex)
            {
                message = ex.Message;
                return Result.Failed;
            }
        }

        // ---- Helpers ----------------------------------------------------------

        private static string GetFilePath(Document doc)
        {
            try
            {
                var mp = doc.GetWorksharingCentralModelPath();
                if (mp != null && !mp.Empty)
                    return ModelPathUtils.ConvertModelPathToUserVisiblePath(mp);
            }
            catch { }
            return doc.PathName;
        }

        private static string GetRevitVersion(Document doc)
        {
            try { return doc.Application.VersionNumber; }
            catch { return "unknown"; }
        }
    }
}
