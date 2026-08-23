// meta-webhook Edge Function (Supabase)
// Handles WhatsApp Cloud API webhook verification and incoming events
// Deploy under supabase/functions/meta-webhook/index.ts

import { createClient } from "@supabase/supabase-js";
import { json } from "@remix-run/node"; // for response helpers

// Initialize Supabase client – the URL and ANON_KEY are injected as env vars by Supabase Edge Runtime
const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const handler = async (event: any) => {
  const { request } = event;
  const method = request.method;

  // GET verification
  if (method === "GET") {
    const url = new URL(request.url);
    const hubMode = url.searchParams.get("hub.mode");
    const hubVerifyToken = url.searchParams.get("hub.verify_token");
    const hubChallenge = url.searchParams.get("hub.challenge");

    const expectedToken = process.env.META_VERIFY_TOKEN;
    if (hubMode === "subscribe" && hubVerifyToken === expectedToken && hubChallenge) {
      return new Response(hubChallenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("Verification token mismatch", { status: 403 });
  }

  // POST incoming webhook events
  if (method === "POST") {
    try {
      const payload = await request.json();
      // Typical WhatsApp message structure (simplified)
      const messages = payload?.entry?.[0]?.changes?.[0]?.value?.messages ?? [];
      for (const msg of messages) {
        const sender = msg.from ?? "";
        const type = msg.type ?? "";
        const content = msg?.text?.body ?? "";

        // Store in messages table (assumes a table "messages" with columns)
        const { error } = await supabase.from("messages").insert({
          sender_number: sender,
          message_type: type,
          content: content,
          received_at: new Date().toISOString(),
        });
        if (error) {
          console.error("Supabase insert error:", error);
        }
      }
      // Fast response to Meta
      return new Response(null, { status: 200 });
    } catch (err) {
      console.error("Webhook processing error:", err);
      return new Response("Server error", { status: 500 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
};
