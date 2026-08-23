// app/api/webhook/route.js

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req) {
  const body = await req.json();

  // Log the incoming request body for debugging
  console.log(JSON.stringify(body, null, 2));

  // TODO: Process the WhatsApp message, e.g., parse, lead scoring, Supabase save, etc.
  // await processWhatsAppMessage(body);

  return new Response("OK", { status: 200 });
}
