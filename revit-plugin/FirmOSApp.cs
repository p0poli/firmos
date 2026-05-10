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
    /// Lifecycle:  OnStartup → register dockable panes, build ribbon, subscribe events.
    ///             OnShutdown → unsubscribe events.
    ///
    /// Ribbon layout (Vitruvius tab)
    /// ─────────────────────────────
    ///   Panel 1 "Connect"  — Connect to Vitruvius
    ///   Panel 2 "Panels"   — AI Assistant toggle · Activity toggle
    ///   Panel 3 "Work"     — Log Work
    ///   Panel 4 "Modules"  — (grayed-out placeholders)
    ///
    /// Dockable panes (registered BEFORE ribbon per Revit requirement)
    /// ───────────────────────────────────────────────────────────────
    ///   Chat pane     — WebView2 pointing at /#/revit-chat
    ///   Activity pane — native WPF: project stats, my tasks, online users
    /// </summary>
    public class FirmOSApp : IExternalApplication
    {
        // ── Log file ─────────────────────────────────────────────────────────
        private static readonly string LogPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Vitruvius", "startup_log.txt");

        // ── State ─────────────────────────────────────────────────────────────
        private readonly ConcurrentDictionary<string, DateTime> _openTimes = new();

        /// <summary>
        /// Path of the most-recently opened (non-family) Revit document.
        /// Read by <see cref="ActivityPaneContent"/> on every refresh so it can
        /// resolve a project even when the panel was first shown while a document
        /// was already open (i.e. OnDocumentOpened had already fired before the
        /// pane was created).
        /// </summary>
        internal static string CurrentOpenFilePath { get; private set; }

        // Singleton providers kept alive so pane content can be notified later
        private readonly ChatDockablePanel     _chatPanel     = new();
        private readonly ActivityDockablePanel _activityPanel = new();

        // ── Static constructor ────────────────────────────────────────────────
        static FirmOSApp()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(LogPath)!);
                File.AppendAllText(LogPath,
                    $"{Environment.NewLine}" +
                    $"====== FirmOSApp type initialised at {DateTime.Now:yyyy-MM-dd HH:mm:ss} ======{Environment.NewLine}");
            }
            catch { /* static ctor must never throw */ }
        }

        // ── IExternalApplication ──────────────────────────────────────────────

        public Result OnStartup(UIControlledApplication app)
        {
            Log("OnStartup ▶ begin");
            try
            {
                // STEP 1: Register dockable panes BEFORE building the ribbon.
                // Revit requires registration to happen during OnStartup, before
                // any ribbon buttons that reference pane IDs exist.
                Log("Registering dockable panes…");
                RegisterDockablePanes(app);

                // STEP 2: Build ribbon.
                Log("Building ribbon…");
                BuildRibbon(app);

                // STEP 3: Subscribe to document events.
                Log("Subscribing to document events…");
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
                catch { }
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
            catch (Exception ex) { LogException("OnShutdown", ex); }
            Log("OnShutdown ◀ Result.Succeeded");
            return Result.Succeeded;
        }

        // ── Dockable pane registration ────────────────────────────────────────

        private void RegisterDockablePanes(UIControlledApplication app)
        {
            app.RegisterDockablePane(
                ChatDockablePanel.PaneId,
                "Vitruvius AI Chat",
                _chatPanel);
            Log($"  Registered Chat pane: {ChatDockablePanel.PaneId.Guid}");

            app.RegisterDockablePane(
                ActivityDockablePanel.PaneId,
                "Vitruvius Activity",
                _activityPanel);
            Log($"  Registered Activity pane: {ActivityDockablePanel.PaneId.Guid}");
        }

        // ── Ribbon ───────────────────────────────────────────────────────────

        private static void BuildRibbon(UIControlledApplication app)
        {
            const string Tab = "Vitruvius";
            var asmPath = typeof(FirmOSApp).Assembly.Location;
            Log($"Assembly location: {asmPath}");

            try { app.CreateRibbonTab(Tab); }
            catch { /* already exists */ }

            // ── Panel 1: Connect ──────────────────────────────────────────────
            var connectPanel = app.CreateRibbonPanel(Tab, "Connect");
            connectPanel.AddItem(new PushButtonData(
                "ConnectVitruvius",
                "Connect to\nVitruvius",
                asmPath,
                typeof(ConnectCommand).FullName!)
            {
                ToolTip         = "Connect this Revit model to a Vitruvius project.",
                LongDescription =
                    "Sign in to Vitruvius and link this file to a project so " +
                    "model events are automatically tracked.",
            });

            // ── Panel 2: Panels ───────────────────────────────────────────────
            var panelsPanel = app.CreateRibbonPanel(Tab, "Panels");

            panelsPanel.AddItem(new PushButtonData(
                "ToggleChatPane",
                "AI\nAssistant",
                asmPath,
                typeof(ToggleChatPaneCommand).FullName!)
            {
                ToolTip = "Show or hide the Vitruvius AI chat panel.",
            });

            panelsPanel.AddSeparator();

            panelsPanel.AddItem(new PushButtonData(
                "ToggleActivityPane",
                "Activity\nDashboard",
                asmPath,
                typeof(ToggleActivityPaneCommand).FullName!)
            {
                ToolTip = "Show or hide the Model Activity dashboard panel.",
            });

            // ── Panel 3: Work ─────────────────────────────────────────────────
            var workPanel = app.CreateRibbonPanel(Tab, "Work");

            workPanel.AddItem(new PushButtonData(
                "LogWork",
                "Log\nWork",
                asmPath,
                typeof(TaskLoggerCommand).FullName!)
            {
                ToolTip = "Record time spent on a task.",
            });

            // ── Panel 4: Modules (placeholder) ────────────────────────────────
            var modulesPanel = app.CreateRibbonPanel(Tab, "Modules");

            var complianceData = new PushButtonData(
                "ComplianceModule",
                "Compliance\nCheck",
                asmPath,
                typeof(ConnectCommand).FullName!)
            {
                ToolTip = "Automated compliance checking — coming soon.",
            };
            var complianceBtn = modulesPanel.AddItem(complianceData) as PushButton;
            if (complianceBtn != null) complianceBtn.Enabled = false;

            var fireData = new PushButtonData(
                "FireSafetyModule",
                "Fire\nSafety",
                asmPath,
                typeof(ConnectCommand).FullName!)
            {
                ToolTip = "Fire safety analysis — coming soon.",
            };
            var fireBtn = modulesPanel.AddItem(fireData) as PushButton;
            if (fireBtn != null) fireBtn.Enabled = false;

            Log("Ribbon built — 4 panels: Connect, Panels, Work, Modules.");
        }

        // ── Document event handlers ───────────────────────────────────────────

        private void OnDocumentOpened(object sender, DocumentOpenedEventArgs e)
        {
            try
            {
                var doc = e.Document;
                if (doc == null || doc.IsFamilyDocument) return;

                var path = GetFilePath(doc);
                if (string.IsNullOrEmpty(path)) return;

                _openTimes[path] = DateTime.UtcNow;
                CurrentOpenFilePath = path;   // let Activity panel find the project on demand

                var projectId = ProjectMatcher.Instance.GetProjectForFile(path);
                if (projectId == Guid.Empty) return;

                // Notify the Activity panel about the new project
                _activityPanel.NotifyProjectChanged(projectId);

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
            catch (Exception ex) { LogException("OnDocumentOpened", ex); }
        }

        private void OnDocumentClosing(object sender, DocumentClosingEventArgs e)
        {
            try
            {
                var doc = e.Document;
                if (doc == null || doc.IsFamilyDocument) return;

                var path = GetFilePath(doc);
                if (string.IsNullOrEmpty(path)) return;

                // Clear the static reference so the Activity panel knows no
                // project is active after this document closes.
                if (CurrentOpenFilePath == path)
                    CurrentOpenFilePath = null;

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
            catch (Exception ex) { LogException("OnDocumentClosing", ex); }
        }

        // ── Helpers ──────────────────────────────────────────────────────────

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
            try   { return doc.Application.VersionNumber; }
            catch { return "unknown"; }
        }

        // ── Logging ──────────────────────────────────────────────────────────

        internal static void Log(string message)
        {
            try
            {
                File.AppendAllText(LogPath,
                    $"[{DateTime.Now:HH:mm:ss.fff}] {message}{Environment.NewLine}");
            }
            catch { }
        }

        internal static void LogException(string context, Exception ex)
        {
            Log($"ERROR in {context}:");
            for (var e = ex; e != null; e = e.InnerException)
            {
                Log($"  [{e.GetType().FullName}] {e.Message}");
                if (!string.IsNullOrWhiteSpace(e.StackTrace))
                    Log($"  {e.StackTrace.TrimEnd()}");
                if (e.InnerException != null) Log("  -- inner exception --");
            }
        }
    }
}
