using System.Collections.Generic;
using System.ComponentModel.Composition;
using System.ComponentModel.Composition.Hosting;
using System.IO;

namespace FirmOS.Core
{
    /// <summary>
    /// Discovers FirmOS modules via MEF. Loads anything that exports IFirmOSModule:
    ///   - the plugin assembly itself (so built-in modules like ComplianceChecker work)
    ///   - any DLL inside the /Modules folder next to the plugin
    /// </summary>
    public class ModuleLoader
    {
        [ImportMany(typeof(IFirmOSModule))]
        public IEnumerable<IFirmOSModule> Modules { get; private set; }

        public void LoadModules(string modulesPath)
        {
            var catalog = new AggregateCatalog();

            // Built-in modules shipped in the plugin assembly.
            catalog.Catalogs.Add(new AssemblyCatalog(typeof(ModuleLoader).Assembly));

            if (Directory.Exists(modulesPath))
            {
                // Top-level DLLs in /Modules.
                catalog.Catalogs.Add(new DirectoryCatalog(modulesPath, "*.dll"));

                // And any per-module subfolders.
                foreach (var dir in Directory.EnumerateDirectories(modulesPath))
                {
                    catalog.Catalogs.Add(new DirectoryCatalog(dir, "*.dll"));
                }
            }

            using (var container = new CompositionContainer(catalog))
            {
                container.ComposeParts(this);
            }
        }
    }
}
