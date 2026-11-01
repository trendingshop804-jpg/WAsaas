using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading.Tasks;
using System.Windows.Forms;

class Launcher : Form {
    const string Origin = "http://localhost:3001";
    readonly string root = AppDomain.CurrentDomain.BaseDirectory;
    readonly Label status = new Label { Left = 22, Top = 24, Width = 435, Height = 50, Text = "Starting local server..." };
    readonly Button open = new Button { Left = 22, Top = 90, Width = 200, Text = "Open NextBright", Enabled = false };
    Process server;
    bool starting = true;

    [STAThread]
    static void Main(string[] args) {
        if (args.Length > 0 && args[0] == "--self-test") {
            Environment.Exit(File.Exists(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "dev-server.js")) && File.Exists(NodePath()) ? 0 : 1);
            return;
        }
        Application.EnableVisualStyles();
        Application.Run(new Launcher());
    }
    public Launcher() {
        Text = "NextBright CRM - Local Application";
        ClientSize = new System.Drawing.Size(480, 155);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        Controls.Add(status); Controls.Add(open);
        var stop = new Button { Left = 240, Top = 90, Width = 210, Text = "Exit / Stop local server" };
        Controls.Add(stop);
        open.Click += (s, e) => OpenApp();
        stop.Click += (s, e) => Close();
        FormClosing += (s, e) => {
            if (starting) { e.Cancel = true; return; }
            if (server != null) { try { if (!server.HasExited) { server.Kill(); server.WaitForExit(3000); } } catch {} server.Dispose(); }
        };
        Shown += async (s, e) => {
            try {
                if (!File.Exists(Path.Combine(root, "dev-server.js"))) throw new Exception("Keep NextBright.exe inside the saas project folder.");
                if (!File.Exists(NodePath())) throw new Exception("Node.js is required to run this local project.");
                if (!await Healthy()) {
                    server = Process.Start(new ProcessStartInfo(NodePath(), "\"" + Path.Combine(root, "dev-server.js") + "\"") {
                        WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true
                    });
                    bool ready = false;
                    for (int i = 0; i < 60; i++) {
                        if (server.HasExited) throw new Exception("Local server could not start. Check whether port 3001 is already in use.");
                        if (await Healthy()) { ready = true; break; }
                        await Task.Delay(250);
                    }
                    if (!ready) throw new Exception("Local server did not become ready on port 3001.");
                }
                status.Text = "Local server ready. Keep this window open while using the app.";
                open.Enabled = true;
                OpenApp();
            } catch (Exception ex) {
                status.Text = "Startup failed.";
                MessageBox.Show(ex.Message, "NextBright CRM", MessageBoxButtons.OK, MessageBoxIcon.Error);
            } finally { starting = false; }
        };
    }
    static string NodePath() {
        string installed = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe");
        if (File.Exists(installed)) return installed;
        foreach (string dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';')) {
            try { string path = Path.Combine(dir.Trim('"'), "node.exe"); if (File.Exists(path)) return path; } catch {}
        }
        return installed;
    }
    static async Task<bool> Healthy() {
        try {
            var request = (HttpWebRequest)WebRequest.Create(Origin + "/__nextbright_health");
            request.Timeout = 700;
            request.Proxy = null;
            using (var response = await request.GetResponseAsync())
            using (var reader = new StreamReader(response.GetResponseStream()))
                return await reader.ReadToEndAsync() == "nextbright-local-v1";
        } catch { return false; }
    }
    void OpenApp() {
        try {
            string edge = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe");
            if (File.Exists(edge)) {
                // A stable browser profile and origin preserve Supabase sessions.
                Process.Start(new ProcessStartInfo(edge, "--app=" + Origin + "/nextbright-crm/index.html") { UseShellExecute = true });
            } else Process.Start(new ProcessStartInfo(Origin + "/nextbright-crm/index.html") { UseShellExecute = true });
        } catch (Exception ex) { MessageBox.Show(ex.Message, "Could not open app"); }
    }
}
