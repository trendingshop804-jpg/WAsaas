// supabase/functions/whatsapp-webhook/index.ts
// Verify webhook subscription for WhatsApp Meta Cloud API

export const onRequest = async ({ request }: { request: Request }) => {
  // Handle verification (GET)
  if (request.method === "GET") {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expectedToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
    if (mode === "subscribe" && token && challenge && token === expectedToken) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // Handle inbound messages (POST)
  if (request.method === "POST") {
    try {
      const body = await request.json();
      const change = body.entry?.[0]?.changes?.[0]?.value;
      const message = change?.messages?.[0];

      // Ignore non‑message webhook events (e.g., status updates)
      if (!message) {
        return new Response("OK", { status: 200 });
      }

      const phone = message.from;
      const contactName = change.contacts?.[0]?.profile?.name || "Unknown";
      const messageType = message.type;
      const content = message.text?.body || "";

      // ---- Placeholder for your own persistence logic ----
      // Example: insert into a Supabase table called "messages"
      // const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_ANON_KEY"));
      // await supabase.from("messages").insert({ phone, contact_name: contactName, type: messageType, content, received_at: new Date().toISOString() });
      // ---------------------------------------------------

      console.log("[Webhook] Received inbound message", { phone, contactName, messageType, content });
    } catch (err) {
      console.warn("Webhook processing error", err);
    }
    return new Response("OK", { status: 200 });
  }

  // Any other HTTP method is not supported
  return new Response("Method Not Allowed", { status: 405 });
};
