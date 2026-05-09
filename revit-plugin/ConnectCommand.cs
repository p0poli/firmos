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
            Log("ConnectCommand.Execute ▶ begin");
            try
            {
                // ---- Active document check ------------------------------------
                var uiDoc = commandData.Application.ActiveUIDocument;
                Log($"ActiveUIDocument: {(uiDoc == null ? "null" : "ok")}");

                var doc = uiDoc?.Document;
                Log($"Document: {(doc == null ? "null" : doc.IsFamilyDocument ? "family (skipped)" : doc.Title)}");

                if (doc == null || doc.IsFamilyDocument)
                {
                    TaskDialog.Show("Vitruvius", "Please open a project model first.");
                    Log("ConnectCommand.Execute ◀ Cancelled (no project document)");
                    return Result.Cancelled;
                }

                // ---- Step 1: ensure the user is logged in --------------------
                var loggedIn = ApiClient.Instance.IsLoggedIn();
                Log($"IsLoggedIn check: {loggedIn}");

                if (!loggedIn)
                {
                    Log("Constructing LoginDialog...");
                    LoginDialog login;
                    try
                    {
                        login = new LoginDialog();
                    }
                    catch (Exception ex)
                    {
                        FirmOSApp.LogException("new LoginDialog()", ex);
                        TaskDialog.Show("Vitruvius",
                            $"Could not open login window:\n{ex.Message}\n\nSee log:\n" +
                            System.IO.Path.Combine(
                                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                                "Vitruvius", "startup_log.txt"));
                        return Result.Failed;
                    }

                    Log("Calling LoginDialog.ShowDialog()...");
                    bool? dlgResult;
                    try
                    {
                        dlgResult = login.ShowDialog();
                    }
                    catch (Exception ex)
                    {
                        FirmOSApp.LogException("LoginDialog.ShowDialog()", ex);
                        TaskDialog.Show("Vitruvius",
                            $"Login dialog error:\n{ex.Message}\n\nSee log:\n" +
                            System.IO.Path.Combine(
                                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                                "Vitruvius", "startup_log.txt"));
                        return Result.Failed;
                    }

                    Log($"LoginDialog.ShowDialog() returned: {dlgResult}");
                    Log($"IsLoggedIn after dialog: {ApiClient.Instance.IsLoggedIn()}");

                    if (!ApiClient.Instance.IsLoggedIn())
                    {
                        Log("ConnectCommand.Execute ◀ Cancelled (user closed dialog without logging in)");
                        return Result.Cancelled;
                    }
                }

                // ---- Step 2: check existing mapping -------------------------
                var filePath = GetFilePath(doc);
                Log($"File path: {filePath}");

                var projectId = ProjectMatcher.Instance.GetProjectForFile(filePath);
                Log($"Existing project mapping: {(projectId == Guid.Empty ? "none" : projectId.ToString())}");

                if (projectId != Guid.Empty)
                {
                    TaskDialog.Show(
                        "Vitruvius",
                        $"This file is already linked to a Vitruvius project.\n\nProject ID: {projectId}");
                    Log("ConnectCommand.Execute ◀ Succeeded (already mapped)");
                    return Result.Succeeded;
                }

                // ---- Step 3: pick a project ---------------------------------
                Log("Fetching projects from API...");
                List<ProjectResponse> projects;
                try
                {
                    projects = Task.Run(() => ApiClient.Instance.GetProjectsAsync()).Result;
                    Log($"Projects fetched: {projects?.Count ?? 0}");
                }
                catch (Exception ex)
                {
                    FirmOSApp.LogException("GetProjectsAsync", ex);
                    TaskDialog.Show("Vitruvius", $"Could not load projects:\n{ex.Message}");
                    return Result.Failed;
                }

                if (projects == null || projects.Count == 0)
                {
                    Log("ConnectCommand.Execute ◀ Cancelled (no projects)");
                    TaskDialog.Show("Vitruvius",
                        "No projects found. Create a project on the Vitruvius dashboard first.");
                    return Result.Cancelled;
                }

                Log($"Showing ProjectSelectDialog with {projects.Count} project(s)...");
                var picker = new ProjectSelectDialog(projects);
                var picked = picker.ShowDialog();
                Log($"ProjectSelectDialog returned: {picked}, selected: {picker.SelectedProject?.Name ?? "none"}");

                if (picked != true || picker.SelectedProject == null)
                {
                    Log("ConnectCommand.Execute ◀ Cancelled (no project selected)");
                    return Result.Cancelled;
                }

                // ---- Step 4: save mapping and send "opened" event -----------
                var selected = picker.SelectedProject;
                Log($"Saving mapping: {filePath} → {selected.Id} ({selected.Name})");
                ProjectMatcher.Instance.SaveMapping(filePath, selected.Id);

                var payload = new ModelEventPayload
                {
                    EventType     = "opened",
                    Timestamp     = DateTime.UtcNow.ToString("o"),
                    RevitFileName = System.IO.Path.GetFileName(filePath),
                    RevitVersion  = GetRevitVersion(doc),
                    ProjectId     = selected.Id,
                };
                Log("Sending 'opened' model event...");
                _ = ApiClient.Instance.SendModelEventAsync(payload);

                TaskDialog.Show(
                    "Vitruvius",
                    $"Connected!\n\n\"{System.IO.Path.GetFileName(filePath)}\" " +
                    $"is now linked to project \"{selected.Name}\".");

                Log("ConnectCommand.Execute ◀ Succeeded");
                return Result.Succeeded;
            }
            catch (Exception ex)
            {
                // Outer safety net — should never be reached if inner try/catches work.
                FirmOSApp.LogException("ConnectCommand.Execute [outer catch]", ex);
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
            catch { /* worksharing not enabled */ }
            return doc.PathName;
        }

        private static string GetRevitVersion(Document doc)
        {
            try   { return doc.Application.VersionNumber; }
            catch { return "unknown"; }
        }

        private static void Log(string msg) =>
            FirmOSApp.Log($"[ConnectCommand] {msg}");
    }
}
