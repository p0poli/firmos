using System;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Events;
using Autodesk.Revit.UI;

namespace FirmOS.Revit
{
    /// <summary>
    /// Entry point for the Vitruvius Revit add-in.
    ///
    /// Lifecycle
    /// ---------
    ///   OnStartup  — build ribbon UI, subscribe to document events.
    ///   OnShutdown — unsubscribe events, release resources.
    ///
    /// Document events
    /// ---------------
    ///   DocumentOpened   → POST /revit/event  { event_type: "opened" }
    ///   DocumentClosing  → POST /revit/event  { event_type: "closed", duration: … }
    ///     (DocumentClosing fires *before* the file is released, so the path
    ///      is still available. DocumentClosed fires after — path is gone.)
    /// </summary>
    [Regeneration(RegenerationOption.Manual)]
    public class FirmOSApp : IExternalApplication
    {
        // Tracks when each document was opened so we can compute session duration.
        private readonly System.Collections.Concurrent.ConcurrentDictionary<string, DateTime>
            _openTimes = new System.Collections.Concurrent.ConcurrentDictionary<string, DateTime>();

        // ---- IExternalApplication -------------------------------------------

        public Result OnStartup(UIControlledApplication app)
        {
            try
            {
                BuildRibbon(app);
                app.ControlledApplication.DocumentOpened   += OnDocumentOpened;
                app.ControlledApplication.DocumentClosing  += OnDocumentClosing;
                return Result.Succeeded;
            }
            catch (Exception ex)
            {
                TaskDialog.Show("Vitruvius", $"Startup error: {ex.Message}");
                return Result.Failed;
            }
        }

        public Result OnShutdown(UIControlledApplication app)
        {
            app.ControlledApplication.DocumentOpened  -= OnDocumentOpened;
            app.ControlledApplication.DocumentClosing -= OnDocumentClosing;
            return Result.Succeeded;
        }

        // ---- Ribbon -----------------------------------------------------------

        private static void BuildRibbon(UIControlledApplication app)
        {
            const string tabName   = "Vitruvius";
            const string panelName = "Connect";

            try { app.CreateRibbonTab(tabName); }
            catch { /* tab already exists */ }

            var panel = app.CreateRibbonPanel(tabName, panelName);

            var btnData = new PushButtonData(
                "ConnectVitruvius",
                "Connect to\nVitruvius",
                typeof(FirmOSApp).Assembly.Location,
                typeof(ConnectCommand).FullName)
            {
                ToolTip     = "Connect this Revit model to a Vitruvius project.",
                LongDescription =
                    "Sign in to Vitruvius and link this file to a project so that " +
                    "model events are automatically tracked.",
            };

            panel.AddItem(btnData);
        }

        // ---- Document event handlers -----------------------------------------

        private void OnDocumentOpened(object sender, DocumentOpenedEventArgs e)
        {
            var doc = e.Document;
            if (doc == null || doc.IsFamilyDocument) return;

            var path = GetFilePath(doc);
            if (string.IsNullOrEmpty(path)) return;

            _openTimes[path] = DateTime.UtcNow;

            var projectId = ProjectMatcher.Instance.GetProjectForFile(path);
            if (projectId == Guid.Empty) return;   // not mapped yet — skip

            var payload = new ModelEventPayload
            {
                EventType     = "opened",
                Timestamp     = DateTime.UtcNow.ToString("o"),
                RevitFileName = System.IO.Path.GetFileName(path),
                RevitVersion  = GetRevitVersion(doc),
                ProjectId     = projectId,
            };

            // Fire-and-forget — never block Revit's main thread.
            _ = ApiClient.Instance.SendModelEventAsync(payload);
        }

        private void OnDocumentClosing(object sender, DocumentClosingEventArgs e)
        {
            var doc = e.Document;
            if (doc == null || doc.IsFamilyDocument) return;

            var path = GetFilePath(doc);
            if (string.IsNullOrEmpty(path)) return;

            double? duration = null;
            if (_openTimes.TryRemove(path, out var opened))
                duration = (DateTime.UtcNow - opened).TotalSeconds;

            var projectId = ProjectMatcher.Instance.GetProjectForFile(path);
            if (projectId == Guid.Empty) return;

            var payload = new ModelEventPayload
            {
                EventType     = "closed",
                Timestamp     = DateTime.UtcNow.ToString("o"),
                Duration      = duration,
                RevitFileName = System.IO.Path.GetFileName(path),
                RevitVersion  = GetRevitVersion(doc),
                ProjectId     = projectId,
            };

            _ = ApiClient.Instance.SendModelEventAsync(payload);
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
            try { return doc.Application.VersionNumber; }
            catch { return "unknown"; }
        }
    }
}
