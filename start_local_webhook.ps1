# start_local_webhook.ps1
# Native zero-dependency local Webhook server for Meta WhatsApp Cloud API

$port = 8000
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

$verifyToken = "Nextbright2026"

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "         Meta WhatsApp Webhook Local Server (Port $port)                  " -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan

try {
    $listener.Start()
    Write-Host "Webhook server active at: http://localhost:$port/webhooks/meta" -ForegroundColor Green
    Write-Host "Verify Token: $verifyToken" -ForegroundColor Yellow
    Write-Host "--------------------------------------------------------------------------" -ForegroundColor Gray

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $path = $request.Url.LocalPath
        $method = $request.HttpMethod

        # CORS Headers
        $response.AddHeader("Access-Control-Allow-Origin", "*")
        $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        $response.AddHeader("Access-Control-Allow-Headers", "*")

        if ($method -eq "OPTIONS") {
            $response.StatusCode = 200
            $response.Close()
            continue
        }

        # 1. Meta Webhook Verification Challenge (GET)
        if ($path -eq "/webhooks/meta" -and $method -eq "GET") {
            $mode = $request.QueryString["hub.mode"]
            $token = $request.QueryString["hub.verify_token"]
            $challenge = $request.QueryString["hub.challenge"]

            if ($mode -eq "subscribe" -and $token -eq $verifyToken) {
                Write-Host "[Meta Handshake] Webhook Verified Successfully!" -ForegroundColor Green
                $response.StatusCode = 200
                $response.ContentType = "text/plain"
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($challenge)
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                Write-Host "[Meta Handshake] Verification Failed. Token mismatch: $token" -ForegroundColor Red
                $response.StatusCode = 403
            }
        }
        # 2. Meta Inbound Message Events (POST)
        elseif ($path -eq "/webhooks/meta" -and $method -eq "POST") {
            $reader = New-Object System.IO.StreamReader($request.InputStream, $request.ContentEncoding)
            $body = $reader.ReadToEnd()
            
            Write-Host "[Inbound Message Received]:" -ForegroundColor Cyan
            Write-Host $body -ForegroundColor Gray

            # Return 200 OK immediately to Meta
            $response.StatusCode = 200
            $response.ContentType = "text/plain"
            $respBytes = [System.Text.Encoding]::UTF8.GetBytes("SUCCESS")
            $response.OutputStream.Write($respBytes, 0, $respBytes.Length)
        }
        else {
            $response.StatusCode = 200
            $response.ContentType = "text/plain"
            $bytes = [System.Text.Encoding]::UTF8.GetBytes("NexusLead Webhook Server Active")
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        }

        $response.Close()
    }
} catch {
    Write-Host "Server error: $_" -ForegroundColor Red
} finally {
    $listener.Close()
}
