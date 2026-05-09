using System;
using System.Collections.Concurrent;
using System.IO;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Events;
using Autodesk.Revit.UI;

namespace FirmOS.Revit
{
    /// <summary>
    /// Entry point for the Vitruvius Revit add-in (IExternalApplication).
    ///
    /// NOTE: IExternalApplication must NOT carry [Transaction] or [Regeneration]
    /// attributes — those are strictly for IExternalCommand implementations.
    /// Applying [Regeneration] to an IExternalApplication class causes Revit's
    /// add-in loader to throw TypeLoadException when it validates custom attributes
    /// during type resolution.
    ///
    /// Lifecycle:  OnStartup → build ribbon, subscribe events.
    ///             OnShutdown → unsubscribe events.
    ///
    /// Document events
    /// ---------------
    ///   DocumentOpened  → POST /revit/event { event_type: "opened" }
    ///   DocumentClosing → POST /revit/event { event_type: "closed", duration: … }
    ///   (DocumentClosing fires BEFORE the file handle is released, so the
    ///    path is still readable. DocumentClosed fires after — path is gone.)
    /// </summary>
    public class FirmOSApp : IExternalApplication
    {
        // ---- Log file ---------------------------------------------------------
        // Writes to %APPDATA%\Vitruvius\startup_log.txt.
        // Survives Revit swallowing exceptions; useful when the TaskDialog
        // never appears because Revit already terminated the add-in.

        private static readonly string LogPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Vitruvius", "startup_log.txt");

        // ---- State ------------------------------------------------------------

        // Tracks when each document was opened so we can compute session duration.
        private readonly ConcurrentDictionary<string, DateTime> _openTimes = new();

        // ---- Static constructor -----------------------------------------------
        // Runs once when the type is first accessed — before OnStartup.
        // Any exception here surfaces as a TypeInitializationException (which
        // wraps the real cause) and appears in the log.

        static FirmOSApp()
        {
            try
            {
                // Ensure the log directory exists and stamp a start marker.
                Directory.CreateDirectory(
                    Path.GetDirectoryName(LogPath)!);

                File.AppendAllText(LogPath,
                    $"{Environment.NewLine}" +
                    $"====== FirmOSApp type initialised at {DateTime.Now:yyyy-MM-dd HH:mm:ss} ======{Environment.NewLine}");
            }
            catch { /* static ctor must never throw */ }
        }

        // ---- IExternalApplication ---------------------------------------------

        public Result OnStartup(UIControlledApplication app)
        {
            Log("OnStartup ▶ begin");
            try
            {
                Log("Building ribbon tab...");
                BuildRibbon(app);

                Log("Subscribing to document events...");
                app.ControlledApplication.DocumentOpened  += OnDocumentOpened;
                app.ControlledApplication.DocumentClosing += OnDocumentClosing;

                Log("OnStartup ◀ Result.Succeeded");
                return Result.Succeeded;
            }
            catch (Exception ex)
            {
                LogException("OnStartup", ex);
                try
                {
                    TaskDialog.Show("Vitruvius — startup error",
                        $"{ex.GetType().Name}: {ex.Message}\n\nSee log:\n{LogPath}");
                }
                catch { /* TaskDialog itself might not be available */ }

                return Result.Failed;
            }
        }

        public Result OnShutdown(UIControlledApplication app)
        {
            Log("OnShutdown ▶ begin");
            try
            {
                app.ControlledApplication.DocumentOpened  -= OnDocumentOpened;
                app.ControlledApplication.DocumentClosing -= OnDocumentClosing;
            }
            catch (Exception ex)
            {
                LogException("OnShutdown", ex);
            }
            Log("OnShutdown ◀ Result.Succeeded");
            return Result.Succeeded;
        }

        // ---- Ribbon -----------------------------------------------------------

        private static void BuildRibbon(UIControlledApplication app)
        {
            Log("CreateRibbonTab...");
            const string tabName   = "Vitruvius";
            const string panelName = "Connect";

            try { app.CreateRibbonTab(tabName); }
            catch { /* tab already exists — harmless */ }

            Log("CreateRibbonPanel...");
            var panel = app.CreateRibbonPanel(tabName, panelName);

            var asmPath = typeof(FirmOSApp).Assembly.Location;
            Log($"Assembly location: {asmPath}");

            var btnData = new PushButtonData(
                "ConnectVitruvius",
                "Connect to\nVitruvius",
                asmPath,
                typeof(ConnectCommand).FullName!)
            {
                ToolTip         = "Connect this Revit model to a Vitruvius project.",
                LongDescription =
                    "Sign in to Vitruvius and link this file to a project so that " +
                    "model events are automatically tracked.",
            };

            panel.AddItem(btnData);
            Log("Ribbon button added.");
        }

        // ---- Document event handlers -----------------------------------------

        private void OnDocumentOpened(object sender, DocumentOpenedEventArgs e)
        {
            try
            {
                var doc = e.Document;
                if (doc == null || doc.IsFamilyDocument) return;

                var path = GetFilePath(doc);
                if (string.IsNullOrEmpty(path)) return;

                _openTimes[path] = DateTime.UtcNow;

                var projectId = ProjectMatcher.Instance.GetProjectForFile(path);
                if (projectId == Guid.Empty) return;   // not mapped yet

                var payload = new ModelEventPayload
                {
                    EventType     = "opened",
                    Timestamp     = DateTime.UtcNow.ToString("o"),
                    RevitFileName = Path.GetFileName(path),
                    RevitVersion  = GetRevitVersion(doc),
                    ProjectId     = projectId,
                };

                _ = ApiClient.Instance.SendModelEventAsync(payload);
            }
            catch (Exception ex)
            {
                LogException("OnDocumentOpened", ex);
            }
        }

        private void OnDocumentClosing(object sender, DocumentClosingEventArgs e)
        {
            try
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
                    RevitFileName = Path.GetFileName(path),
                    RevitVersion  = GetRevitVersion(doc),
                    ProjectId     = projectId,
                };

                _ = ApiClient.Instance.SendModelEventAsync(payload);
            }
            catch (Exception ex)
            {
                LogException("OnDocumentClosing", ex);
            }
        }

        // ---- File path helpers ------------------------------------------------

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

        // ---- Logging helpers (internal so ConnectCommand can also use them) ---

        internal static void Log(string message)
        {
            try
            {
                File.AppendAllText(LogPath,
                    $"[{DateTime.Now:HH:mm:ss.fff}] {message}{Environment.NewLine}");
            }
            catch { /* logging must never throw */ }
        }

        internal static void LogException(string context, Exception ex)
        {
            Log($"ERROR in {context}:");
            for (var e = ex; e != null; e = e.InnerException)
            {
                Log($"  [{e.GetType().FullName}] {e.Message}");
                if (!string.IsNullOrWhiteSpace(e.StackTrace))
                    Log($"  {e.StackTrace.TrimEnd()}");
                if (e.InnerException != null)
                    Log("  -- inner exception --");
            }
        }
    }
}
