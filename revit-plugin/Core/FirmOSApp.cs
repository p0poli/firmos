using System;
using System.IO;
using System.Reflection;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace FirmOS.Core
{
    /// <summary>
    /// Plugin entry point. Boots the API client, loads modules via MEF,
    /// and registers a ribbon panel with one button per module.
    /// </summary>
    public class FirmOSApp : IExternalApplication
    {
        private static ApiClient _client;
        private static ModuleLoader _loader;

        public static ApiClient Client => _client;
        public static ModuleLoader Loader => _loader;

        public Result OnStartup(UIControlledApplication application)
        {
            try
            {
                var baseUrl = Environment.GetEnvironmentVariable("FIRMOS_API_URL")
                              ?? "http://localhost:8000";
                _client = new ApiClient(baseUrl);
                _client.LoadStoredToken();

                var pluginDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
                var modulesDir = Path.Combine(pluginDir ?? string.Empty, "Modules");

                _loader = new ModuleLoader();
                _loader.LoadModules(modulesDir);

                BuildRibbon(application);
                return Result.Succeeded;
            }
            catch (Exception ex)
            {
                TaskDialog.Show("FirmOS", "Startup failed: " + ex);
                return Result.Failed;
            }
        }

        public Result OnShutdown(UIControlledApplication application)
        {
            _client = null;
            _loader = null;
            return Result.Succeeded;
        }

        private static void BuildRibbon(UIControlledApplication app)
        {
            var panel = app.CreateRibbonPanel("FirmOS");
            var assemblyPath = Assembly.GetExecutingAssembly().Location;

            // One button per discovered module — each routes through RunModuleCommand.
            // For the skeleton we wire a single "Run All" button; later replace with per-module buttons.
            var data = new PushButtonData(
                "FirmOS_RunAll",
                "Run\nModules",
                assemblyPath,
                typeof(RunModulesCommand).FullName
            );
            panel.AddItem(data);
        }
    }

    /// <summary>
    /// Runs every loaded module against the active document. Skeleton — production
    /// code should bind one command per module so users can invoke them individually.
    /// </summary>
    [Transaction(TransactionMode.Manual)]
    [Regeneration(RegenerationOption.Manual)]
    public class RunModulesCommand : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            var doc = commandData.Application.ActiveUIDocument?.Document;
            if (doc == null)
            {
                message = "No active document.";
                return Result.Cancelled;
            }

            if (FirmOSApp.Loader == null || FirmOSApp.Client == null)
            {
                message = "FirmOS plugin not initialised.";
                return Result.Failed;
            }

            foreach (var module in FirmOSApp.Loader.Modules)
            {
                try
                {
                    module.Execute(doc, FirmOSApp.Client);
                }
                catch (Exception ex)
                {
                    TaskDialog.Show(module.ModuleName, "Module failed: " + ex.Message);
                }
            }
            return Result.Succeeded;
        }
    }
}
