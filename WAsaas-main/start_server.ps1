# start_server.ps1
# Native zero-dependency static file server for Windows.
# Serves the SaaS application on http://localhost:3000

$port = 3000
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "          NexusLead Dev Server (Native PowerShell Web Server)             " -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan

try {
    $listener.Start()
    Write-Host "⚡ Local server listening at: http://localhost:$port/" -ForegroundColor Green
    Write-Host "Opening app automatically..." -ForegroundColor DarkYellow
    Start-Process "http://localhost:$port/index.html"
    Write-Host "Press Ctrl+C in this terminal window to stop the server." -ForegroundColor Yellow
    Write-Host "--------------------------------------------------------------------------" -ForegroundColor Gray

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $path = $request.Url.LocalPath
        if ($path -eq "/" -or $path -eq "") {
            $path = "/index.html"
        }

        # Safe directory path resolver
        $localPath = Join-Path (Get-Location) $path.TrimStart("/").Replace("/", "\")

        if (Test-Path $localPath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($localPath)
            
            # Simple content-type mapper
            $ext = [System.IO.Path]::GetExtension($localPath).ToLower()
            $contentType = switch ($ext) {
                ".html" { "text/html" }
                ".css"  { "text/css" }
                ".js"   { "application/javascript" }
                ".png"  { "image/png" }
                ".jpg"  { "image/jpeg" }
                ".jpeg" { "image/jpeg" }
                ".svg"  { "image/svg+xml" }
                default { "application/octet-stream" }
            }
            
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            Write-Host "GET  $path  200 OK ($contentType)" -ForegroundColor Gray
        } else {
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            Write-Host "GET  $path  404 Not Found" -ForegroundColor Red
        }
        $response.Close()
    }
} catch {
    Write-Host "Error starting server: $_" -ForegroundColor Red
} finally {
    $listener.Close()
}
