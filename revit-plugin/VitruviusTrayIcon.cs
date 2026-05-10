using System;
using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;

namespace FirmOS.Revit
{
    /// <summary>
    /// System-tray icon shown while the Active Timer is running.
    ///
    /// Tooltip updates every second with elapsed time + task name.
    /// Right-click menu: Stop &amp; Log | Switch Task | Open Vitruvius.
    /// Double-click: re-open the TaskLoggerDialog.
    ///
    /// Must be Dispose()d when the dialog finally closes to remove the icon.
    /// </summary>
    public sealed class VitruviusTrayIcon : IDisposable
    {
        private readonly NotifyIcon       _icon;
        private readonly Timer            _tooltipTimer;

        // Callbacks set by TaskLoggerDialog
        private readonly Action           _onStopAndLog;
        private readonly Action           _onSwitchTask;
        private readonly Action           _onReopen;

        private Func<string> _getTooltip;

        public VitruviusTrayIcon(
            Action onStopAndLog,
            Action onSwitchTask,
            Action onReopen,
            Func<string> getTooltip)
        {
            _onStopAndLog = onStopAndLog;
            _onSwitchTask = onSwitchTask;
            _onReopen     = onReopen;
            _getTooltip   = getTooltip;

            // Build context menu
            var menu = new ContextMenuStrip();
            menu.Items.Add("⏹  Stop & Log",   null, (_, __) => _onStopAndLog());
            menu.Items.Add("↔  Switch Task",   null, (_, __) => _onSwitchTask());
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("🌐  Open Vitruvius", null, (_, __) =>
                Process.Start(new ProcessStartInfo("https://p0poli.github.io/firmos/") { UseShellExecute = true }));

            // Create tray icon — use a simple generated bitmap as placeholder
            _icon = new NotifyIcon
            {
                Icon             = CreatePlaceholderIcon(),
                Text             = "Vitruvius — timer running",
                ContextMenuStrip = menu,
                Visible          = true,
            };
            _icon.DoubleClick += (_, __) => _onReopen();

            // Update tooltip every second
            _tooltipTimer = new Timer { Interval = 1000 };
            _tooltipTimer.Tick += (_, __) =>
            {
                try
                {
                    var tip = _getTooltip?.Invoke() ?? "Vitruvius";
                    // NotifyIcon.Text is limited to 127 chars
                    _icon.Text = tip.Length > 127 ? tip[..127] : tip;
                }
                catch { /* never crash the timer */ }
            };
            _tooltipTimer.Start();
        }

        // ── IDisposable ───────────────────────────────────────────────────────

        public void Dispose()
        {
            _tooltipTimer.Stop();
            _tooltipTimer.Dispose();
            _icon.Visible = false;
            _icon.Dispose();
        }

        // ── Helpers ───────────────────────────────────────────────────────────

        /// <summary>
        /// Creates a tiny 16×16 purple bitmap icon so we don't need an embedded resource.
        /// Replace with a real .ico resource in a future iteration.
        /// </summary>
        private static Icon CreatePlaceholderIcon()
        {
            try
            {
                var bmp = new Bitmap(16, 16);
                using (var g = Graphics.FromImage(bmp))
                {
                    g.Clear(Color.FromArgb(0x5865f2));  // Vitruvius purple
                    g.DrawString("V",
                        new Font("Segoe UI", 8, System.Drawing.FontStyle.Bold),
                        Brushes.White,
                        new PointF(2, 1));
                }
                return Icon.FromHandle(bmp.GetHicon());
            }
            catch
            {
                return SystemIcons.Application;
            }
        }
    }
}
