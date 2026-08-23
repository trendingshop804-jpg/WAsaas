// score-lead Edge Function (Supabase)
// Receives lead data, calls OpenAI to get a score, and updates the lead record.
// Deploy under supabase/functions/score-lead/index.ts

import { json } from "@remix-run/node";
import { Configuration, OpenAIApi } from "openai";

// Initialize OpenAI client using secret key from env
const openai = new OpenAIApi(
  new Configuration({ apiKey: process.env.OPENAI_API_KEY })
);

export const handler = async (event: any) => {
  try {
    const { lead_id, lead } = await event.request.json();

    // Build a concise prompt for scoring
    const prompt = `Score this lead from 0 to 100 based on purchase intent, urgency, and quality of inquiry. Provide a short reason (max 20 words). Lead details: ${JSON.stringify(
      lead
    )}`;

    const aiResp = await openai.createChatCompletion({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 80,
    });

    const content = aiResp.data.choices[0].message?.content?.trim() ?? "";
    // Extract numeric score (first number in response) and the rest as reason
    const scoreMatch = content.match(/(\d{1,3})/);
    const leadScore = scoreMatch ? parseInt(scoreMatch[0], 10) : null;
    const scoreReason = content.replace(/(\d{1,3})/, "").trim();

    // Update the lead row in Supabase via REST API
    const supabaseUrl = process.env.SUPABASE_URL ?? "";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const updateResp = await fetch(`${supabaseUrl}/rest/v1/leads?id=eq.${lead_id}`, {
      method: "PATCH",
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY ?? "",
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ lead_score: leadScore, score_reason: scoreReason }),
    });

    if (!updateResp.ok) {
      const errText = await updateResp.text();
      console.error("Failed to update lead score:", errText);
    }

    return new Response(
      JSON.stringify({ lead_id, lead_score: leadScore, reason: scoreReason }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("score-lead function error:", err);
    return new Response("Internal server error", { status: 500 });
  }
};
