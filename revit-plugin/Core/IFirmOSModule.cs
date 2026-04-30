using Autodesk.Revit.DB;

namespace FirmOS.Core
{
    /// <summary>
    /// Contract every FirmOS module must implement.
    /// Modules are discovered at runtime via MEF (see <see cref="ModuleLoader"/>).
    /// </summary>
    public interface IFirmOSModule
    {
        string ModuleName { get; }
        string ModuleVersion { get; }
        void Execute(Document doc, ApiClient client);
    }
}
