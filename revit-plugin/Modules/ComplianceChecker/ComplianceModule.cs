using System.ComponentModel.Composition;
using Autodesk.Revit.DB;
using FirmOS.Core;

namespace FirmOS.Modules.ComplianceChecker
{
    /// <summary>
    /// Skeleton compliance checker. Real rule logic will live here — this stub
    /// is just so MEF discovery and the call signature are in place.
    /// </summary>
    [Export(typeof(IFirmOSModule))]
    public class ComplianceModule : IFirmOSModule
    {
        public string ModuleName => "Compliance Checker";
        public string ModuleVersion => "0.1.0";

        public void Execute(Document doc, ApiClient client)
        {
            // TODO — implement compliance logic here.
            //
            // Typical flow:
            //   1. POST a ModelEvent (event_type = "check_run") to /revit/event,
            //      capturing the new event id from the response.
            //   2. Walk relevant elements with FilteredElementCollector
            //      (walls, doors, rooms, fire-rated assemblies, accessibility paths…).
            //   3. Apply rules and accumulate an `issues` list of plain objects.
            //   4. POST a CheckResult to /revit/check with:
            //        check_type    = "compliance",
            //        status        = "pass" | "warning" | "fail",
            //        issues        = [...collected issues...],
            //        timestamp     = DateTime.UtcNow,
            //        model_event_id = <id from step 1>.
            //
            // Use client.SendModelEventAsync / client.SendCheckResultAsync.
            // Both are async — call .GetAwaiter().GetResult() inside Revit's
            // single-threaded API context, or move to a background task and
            // marshal back via an external event handler.
        }
    }
}
