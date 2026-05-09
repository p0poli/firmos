using System;
using System.Collections.Generic;

namespace FirmOS.Revit
{
    // -----------------------------------------------------------------------
    // API request / response models
    // -----------------------------------------------------------------------

    public class LoginRequest
    {
        public string Email    { get; set; }
        public string Password { get; set; }
    }

    public class LoginResponse
    {
        public string AccessToken { get; set; }
        public string TokenType   { get; set; }
    }

    public class ModelEventPayload
    {
        public string    EventType     { get; set; }   // "opened" | "closed" | "synced"
        public string    Timestamp     { get; set; }   // ISO-8601
        public double?   Duration      { get; set; }   // seconds (for "closed")
        public string    RevitFileName { get; set; }
        public string    RevitVersion  { get; set; }
        public Guid      ProjectId     { get; set; }
    }

    public class ProjectResponse
    {
        public Guid   Id     { get; set; }
        public string Name   { get; set; }
        public string Status { get; set; }
    }

    // -----------------------------------------------------------------------
    // Local config persisted in %APPDATA%\Vitruvius\config.json
    // -----------------------------------------------------------------------

    public class VitruviusConfig
    {
        public string AccessToken { get; set; }
        public string Email       { get; set; }
        public string BaseUrl     { get; set; } = "https://firmos-backend.onrender.com";
    }
}
