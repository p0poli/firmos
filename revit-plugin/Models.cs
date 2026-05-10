using System;
using Newtonsoft.Json;

namespace FirmOS.Revit
{
    // -----------------------------------------------------------------------
    // API request / response models
    //
    // All [JsonProperty] attributes are explicit so serialisation/deserialisation
    // is correct regardless of which JsonSerializerSettings are active.
    // Newtonsoft.Json's default case-insensitive matching handles simple
    // PascalCase↔camelCase (e.g. "id"↔Id) but NOT snake_case (access_token
    // is NOT matched to AccessToken — the underscore makes them distinct).
    // -----------------------------------------------------------------------

    public class LoginRequest
    {
        [JsonProperty("email")]
        public string Email    { get; set; }

        [JsonProperty("password")]
        public string Password { get; set; }
    }

    public class LoginResponse
    {
        [JsonProperty("access_token")]
        public string AccessToken { get; set; }

        [JsonProperty("token_type")]
        public string TokenType   { get; set; }

        // Returned by the backend but not currently used client-side.
        [JsonProperty("session_id")]
        public string SessionId   { get; set; }
    }

    public class ModelEventPayload
    {
        // Backend (FastAPI/Pydantic) uses snake_case for all field names.
        [JsonProperty("event_type")]
        public string  EventType     { get; set; }   // "opened" | "closed" | "synced"

        [JsonProperty("timestamp")]
        public string  Timestamp     { get; set; }   // ISO-8601

        [JsonProperty("duration")]
        public double? Duration      { get; set; }   // seconds (for "closed")

        [JsonProperty("revit_file_name")]
        public string  RevitFileName { get; set; }

        [JsonProperty("revit_version")]
        public string  RevitVersion  { get; set; }

        [JsonProperty("project_id")]
        public Guid    ProjectId     { get; set; }
    }

    public class ProjectResponse
    {
        // Simple lowercase names — Newtonsoft case-insensitive matching is fine,
        // but explicit attributes make the contract unambiguous.
        [JsonProperty("id")]
        public Guid   Id     { get; set; }

        [JsonProperty("name")]
        public string Name   { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; }
    }

    // -----------------------------------------------------------------------
    // Local config persisted in %APPDATA%\Vitruvius\config.json
    // -----------------------------------------------------------------------

    public class VitruviusConfig
    {
        [JsonProperty("access_token")]
        public string AccessToken { get; set; }

        [JsonProperty("email")]
        public string Email       { get; set; }

        [JsonProperty("base_url")]
        public string BaseUrl     { get; set; } = "https://firmos-backend.onrender.com";
    }

    // -----------------------------------------------------------------------
    // Activity panel view-models (bound to XAML ItemsControls)
    // -----------------------------------------------------------------------

    /// <summary>Summary data for the currently linked project.</summary>
    public class ProjectActivityData
    {
        [JsonProperty("id")]        public Guid   Id          { get; set; }
        [JsonProperty("name")]      public string Name        { get; set; }
        [JsonProperty("status")]    public string Status      { get; set; }
        [JsonProperty("tasks_total")] public int  TasksTotal  { get; set; }
        [JsonProperty("tasks_done")]  public int  TasksDone   { get; set; }
        [JsonProperty("member_count")] public int MemberCount { get; set; }
    }

    /// <summary>Task row for the task list / task-logger combo.</summary>
    public class TaskItem
    {
        [JsonProperty("id")]    public Guid   Id     { get; set; }
        [JsonProperty("title")] public string Title  { get; set; }
        [JsonProperty("status")] public string Status { get; set; }
        [JsonProperty("due_date")] public string DueDate { get; set; }  // "YYYY-MM-DD" or null

        // ---- Computed display properties (for XAML binding) ----

        public string StatusLabel =>
            Status switch
            {
                "todo"        => "To do",
                "in-progress" => "In progress",
                "review"      => "In review",
                "done"        => "Done",
                _             => Status ?? "",
            };

        public string DueDateLabel =>
            string.IsNullOrWhiteSpace(DueDate)
                ? ""
                : DateTime.TryParse(DueDate, out var d)
                    ? d.ToString("MMM d")
                    : DueDate;
    }

    /// <summary>Online-user row for the presence list.</summary>
    public class OnlineUserItem
    {
        [JsonProperty("user_name")]  public string UserName  { get; set; }
        [JsonProperty("role")]       public string Role      { get; set; }
        [JsonProperty("in_revit")]   public bool   InRevit   { get; set; }
        [JsonProperty("last_revit_file")] public string LastRevitFile { get; set; }

        // ---- Computed display properties ----

        public string Initials
        {
            get
            {
                if (string.IsNullOrWhiteSpace(UserName)) return "?";
                var parts = UserName.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
                return parts.Length == 1
                    ? parts[0][..Math.Min(2, parts[0].Length)].ToUpper()
                    : $"{parts[0][0]}{parts[^1][0]}".ToUpper();
            }
        }

        public string StatusLine =>
            InRevit
                ? $"In Revit{(string.IsNullOrWhiteSpace(LastRevitFile) ? "" : " · " + System.IO.Path.GetFileNameWithoutExtension(LastRevitFile))}"
                : "On platform";
    }

    /// <summary>Request body for POST /tasks/{id}/log.</summary>
    public class TaskLogRequest
    {
        [JsonProperty("duration_minutes")] public int    DurationMinutes { get; set; }
        [JsonProperty("notes")]            public string Notes           { get; set; }
        [JsonProperty("logged_at")]        public string LoggedAt        { get; set; }
    }
}
