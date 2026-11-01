Double-click NextBright.exe in the project root. It starts the local Node.js API
server and opens the CRM in a Microsoft Edge app window (or the default browser).
Keep the launcher open; Exit stops only the server it started. An existing
NextBright server is reused and is not stopped by the launcher.

This EXE launches this local project; it is not a standalone installer. Keep the
project files, node_modules, and local .env configuration in place. Node.js and
internet access for Supabase, WhatsApp, and CDN resources are required. Browser
login storage stays under the same localhost:3001 origin across launches.

Rebuild: powershell -ExecutionPolicy Bypass -File desktop/build.ps1
