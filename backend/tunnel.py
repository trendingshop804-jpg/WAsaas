"""
NexusLead AI — Instant Localhost Tunnel for Meta Webhooks
No Node.js or npx needed! Uses Python to create a public HTTPS tunnel.
"""

import sys
import os

try:
    from pyngrok import ngrok
except ImportError:
    print("[!] Installing pyngrok...")
    os.system(f"{sys.executable} -m pip install pyngrok")
    from pyngrok import ngrok

def start_tunnel(port=8000):
    print(f"[*] Starting secure HTTPS tunnel for localhost:{port}...")
    try:
        public_url = ngrok.connect(port).public_url
        print("\n" + "=" * 65)
        print("  🎉 SECURE HTTPS TUNNEL ESTABLISHED!")
        print("=" * 65)
        print(f"\n  👉 Your Public Webhook URL:")
        print(f"     {public_url}/webhooks/meta\n")
        print(f"  👉 Meta Verify Token:")
        print(f"     NEXUSLEAD_META_VERIFY_TOKEN_2026\n")
        print("=" * 65)
        print("\nCopy the URL above and paste it into Meta Developer Portal.")
        print("Keep this terminal open while testing.\n")
        
        # Keep process alive
        import time
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[!] Shutting down tunnel...")
        ngrok.kill()

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    start_tunnel(port)
