from flask import Flask, request, jsonify
import os
import json
import datetime

app = Flask(__name__)

VERIFY_TOKEN = os.environ.get("META_VERIFY_TOKEN", "MY_SECRET_TOKEN")

def log_inbound(phone, text):
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] 📥 Inbound from {phone}: “{text}”")

@app.route("/webhook", methods=["GET"])
def verify():
    mode = request.args.get("hub.mode")
    token = request.args.get("hub.verify_token")
    challenge = request.args.get("hub.challenge")

    if mode == "subscribe" and token == VERIFY_TOKEN:
        print("✅ WEBHOOK VERIFIED")
        return challenge, 200
    return "Verification failed", 403

@app.route("/webhook", methods=["POST"])
def inbound():
    data = request.get_json(force=True)
    try:
        inbound_path = os.path.join(os.path.dirname(__file__), "last_inbound.json")
        with open(inbound_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as exc:
        print("⚠️ Error saving inbound payload:", exc)

    try:
        msg = data["entry"][0]["changes"][0]["value"]["messages"][0]
        phone = msg.get("from", "UNKNOWN")
        text_body = msg.get("text", {}).get("body", "")
        log_inbound(phone, text_body)
    except (KeyError, IndexError) as exc:
        print("⚠️ Could not parse inbound message:", exc)

    return "EVENT_RECEIVED", 200

@app.route("/last_inbound", methods=["GET"])
def get_last_inbound():
    inbound_path = os.path.join(os.path.dirname(__file__), "last_inbound.json")
    if os.path.exists(inbound_path):
        with open(inbound_path, "r", encoding="utf-8") as f:
            return jsonify(json.load(f)), 200
    return jsonify({"error": "No inbound payload"}), 404

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
