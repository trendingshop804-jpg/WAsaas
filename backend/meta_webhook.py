ling collected packages: urllib3, charset_normalizer, requests
   ━━━━━━━━━━━━━╺━━━━━━━━━━━━━━━━━━━━━━━━━━ 1/3 [charset_normalizer]  WARNING: The script normalizer.exe is installed in 'C:\Users\PRATEEBHA\AppData\Local\Python\pythoncore-3.14-64\Scripts' which is not on PATH.     
  Consider adding this directory to PATH or, if you prefer to suppress this warning, use --no-warn-script-location.
Successfully installed charset_normalizer-3.5.1 requests-2.34.2 urllib3-2.7.0
PS C:\Users\PRATEEBHA\Desktop\saas\backend> python meta_webhook.py
 * Serving Flask app 'meta_webhook'
 * Debug mode: off
WARNING: This is a development server. Do not use it in a production deployment. Use a production WSGI server instead.
 * Running on http://127.0.0.1:5000
Press CTRL+C to quit
PS C:\Users\PRATEEBHA\Desktop\saas\backend> ngrok http 5000
PS C:\Users\PRATEEBHA\Desktop\saas\backend> python meta_webhook.py
 * Serving Flask app 'meta_webhook'
 * Debug mode: off
WARNING: This is a development server. Do not use it in a production deployment. Use a production WSGI server instead.
 * Running on all addresses (0.0.0.0)
 * Running on http://127.0.0.1:5000
 * Running on http://192.168.13.35:5000
Press CTRL+C to quit
PS C:\Users\PRATEEBHA\Desktop\saas\backend> from flask import Flask, request, jsonify
>> import os, json, datetime
>>
>> app = Flask(__name__)
>>
>> VERIFY_TOKEN = "MY_SECRET_TOKEN"
>>
>> def log_inbound(phone, text):
>>     ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")       
>>     print(f"[{ts}] 📥 Inbound from {phone}: “{text}”")
>>
>> @app.route("/webhook", methods=["GET"])
>> def verify():
>>     mode = request.args.get("hub.mode")
>>     token = request.args.get("hub.verify_token")
>>     challenge = request.args.get("hub.challenge")
>>
>>     if mode == "subscribe" and token == VERIFY_TOKEN:
>>         print("✅ WEBHOOK VERIFIED")
>>         return challenge, 200
>>     return "Verification failed", 403
>>
>> @app.route("/webhook", methods=["POST"])
>> def inbound():
>>     data = request.get_json(force=True)
>>     try:
>>         inbound_path = os.path.join(os.path.dirname(__file__), "last_inbound.json")
>>         with open(inbound_path, "w", encoding="utf-8") as f:
>>             json.dump(data, f, ensure_ascii=False, indent=2)
>>     except Exception as exc:
>>         print("⚠️ Error saving inbound payload:", exc)
>>
>>     try:
>>         msg = data["entry"][0]["changes"][0]["value"]["messages"][0] 
>>         phone = msg.get("from", "UNKNOWN")
>>         text_body = msg.get("text", {}).get("body", "")
>>         log_inbound(phone, text_body)
>>     except (KeyError, IndexError) as exc:
>>         print("⚠️ Could not parse inbound message:", exc)
>>
>>     return "EVENT_RECEIVED", 200
>>
>> @app.route("/last_inbound", methods=["GET"])
>> def get_last_inbound():
>>     inbound_path = os.path.join(os.path.dirname(__file__), "last_inbound.json")
>>     if os.path.exists(inbound_path):
>>         with open(inbound_path, "r", encoding="utf-8") as f:
>>             return jsonify(json.load(f)), 200
>>     return jsonify({"error": "No inbound payload"}), 404
>>
>> if __name__ == "__main__":
>>     app.run(host="0.0.0.0", port=5000, debug=False)
At line:1 char:1
+ from flask import Flask, request, jsonify
+ ~~~~
The 'from' keyword is not supported in this version of the language.    
At line:8 char:22
+ def log_inbound(phone, text):
+                      ~
Missing argument in parameter list.
At line:9 char:32
+     ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")        
+                                ~
An expression was expected after '('.
At line:12 char:23
+ @app.route("/webhook", methods=["GET"])
+                       ~
Missing expression after ','.
At line:12 char:24
+ @app.route("/webhook", methods=["GET"])
+                        ~~~~~~~~~~~~~~~
Unexpected token 'methods=["GET"]' in expression or statement.
At line:12 char:39
+ @app.route("/webhook", methods=["GET"])
+                                       ~
Unexpected token ')' in expression or statement.
At line:13 char:12
+ def verify():
+            ~
An expression was expected after '('.
At line:18 char:7
+     if mode == "subscribe" and token == VERIFY_TOKEN:
+       ~
Missing '(' after 'if' in if statement.
At line:20 char:25
+         return challenge, 200
+                         ~
Missing argument in parameter list.
At line:23 char:23
+ @app.route("/webhook", methods=["POST"])
+                       ~
Missing expression after ','.
Not all parse errors were reported.  Correct the reported errors and    
try again.
    + CategoryInfo          : ParserError: (:) [], ParentContainsError  
   RecordException
    + FullyQualifiedErrorId : ReservedKeywordNotAllowed
