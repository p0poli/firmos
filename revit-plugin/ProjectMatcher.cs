using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;

namespace FirmOS.Revit
{
    /// <summary>
    /// Persists a mapping of local Revit file paths → Vitruvius project IDs
    /// in %APPDATA%\Vitruvius\project_mappings.json.
    ///
    /// Keys are stored as lower-case, normalised paths so matching is
    /// case-insensitive and slash-direction-agnostic.
    /// </summary>
    public sealed class ProjectMatcher
    {
        // ---- Singleton --------------------------------------------------------

        private static readonly Lazy<ProjectMatcher> _instance =
            new Lazy<ProjectMatcher>(() => new ProjectMatcher());

        public static ProjectMatcher Instance => _instance.Value;

        // ---- Fields -----------------------------------------------------------

        private readonly string _mappingsPath;

        // filePath (normalised) → project GUID
        private Dictionary<string, Guid> _mappings;

        // ---- Constructor ------------------------------------------------------

        private ProjectMatcher()
        {
            _mappingsPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "Vitruvius",
                "project_mappings.json");

            _mappings = Load();
        }

        // ---- Public API -------------------------------------------------------

        /// <summary>
        /// Returns the project GUID mapped to <paramref name="filePath"/>,
        /// or <see cref="Guid.Empty"/> if no mapping exists.
        /// </summary>
        public Guid GetProjectForFile(string filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath)) return Guid.Empty;
            var key = Normalise(filePath);
            return _mappings.TryGetValue(key, out var id) ? id : Guid.Empty;
        }

        /// <summary>
        /// Associates <paramref name="filePath"/> with <paramref name="projectId"/>
        /// and saves to disk.
        /// </summary>
        public void SaveMapping(string filePath, Guid projectId)
        {
            if (string.IsNullOrWhiteSpace(filePath)) return;
            _mappings[Normalise(filePath)] = projectId;
            Save();
        }

        /// <summary>
        /// Removes any mapping for <paramref name="filePath"/> and saves to disk.
        /// </summary>
        public void RemoveMapping(string filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath)) return;
            if (_mappings.Remove(Normalise(filePath)))
                Save();
        }

        // ---- Private helpers --------------------------------------------------

        private static string Normalise(string path) =>
            Path.GetFullPath(path).ToLowerInvariant();

        private Dictionary<string, Guid> Load()
        {
            try
            {
                if (File.Exists(_mappingsPath))
                    return JsonConvert.DeserializeObject<Dictionary<string, Guid>>(
                               File.ReadAllText(_mappingsPath))
                           ?? new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
            }
            catch { /* corrupt file — start fresh */ }
            return new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
        }

        private void Save()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_mappingsPath)!);
                File.WriteAllText(
                    _mappingsPath,
                    JsonConvert.SerializeObject(_mappings, Formatting.Indented));
            }
            catch (Exception ex)
            {
                System.Diagnostics.Trace.WriteLine(
                    $"[Vitruvius] ProjectMatcher.Save failed: {ex.Message}");
            }
        }
    }
}
