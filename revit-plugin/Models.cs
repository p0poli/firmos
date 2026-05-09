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
}
