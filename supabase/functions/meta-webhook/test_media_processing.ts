// test_media_processing.ts
// Test script to verify media download and storage works end-to-end
// Run with: deno run --allow-net --allow-env --allow-read test_media_processing.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testMediaProcessing() {
  console.log("=== Media Processing Test ===\n");

  // Step 1: Download a sample image
  console.log("Step 1: Downloading sample image...");
  const sampleImageUrl = "https://picsum.photos/200/300";
  const downloadRes = await fetch(sampleImageUrl);
  if (!downloadRes.ok) {
    console.error("Failed to download sample image:", downloadRes.status);
    return;
  }
  const buffer = await downloadRes.arrayBuffer();
  const mimeType = downloadRes.headers.get("content-type") || "image/jpeg";
  console.log(`  Downloaded ${buffer.byteLength} bytes, type: ${mimeType}`);

  // Step 2: Upload to Supabase Storage
  console.log("\nStep 2: Uploading to Supabase Storage...");
  const testPhone = "919999999999";
  const testMediaId = "test_media_" + Date.now();
  const storagePath = `${testPhone}/${testMediaId}/test_image.jpg`;

  const { error: uploadError } = await supabase.storage
    .from("whatsapp-media")
    .upload(storagePath, new Uint8Array(buffer), {
      contentType: mimeType,
      upsert: true,
    });

  if (uploadError) {
    console.error("  Upload failed:", uploadError);
    return;
  }
  console.log("  Upload successful to:", storagePath);

  // Step 3: Get public URL
  console.log("\nStep 3: Getting public URL...");
  const { data: publicUrlData } = supabase.storage
    .from("whatsapp-media")
    .getPublicUrl(storagePath);

  const publicUrl = publicUrlData?.publicUrl;
  console.log("  Public URL:", publicUrl);

  if (!publicUrl) {
    console.error("  Failed to get public URL");
    return;
  }

  // Step 4: Insert test message with media_url
  console.log("\nStep 4: Inserting test message...");
  const testMessage = {
    wa_message_id: "test_msg_" + Date.now(),
    sender_number: testPhone,
    content: "📎 Image message",
    message_type: "image",
    direction: "inbound",
    received_at: new Date().toISOString(),
    media_url: publicUrl,
    media_mime_type: mimeType,
    file_name: "test_image.jpg",
    media_caption: "Test image caption",
  };

  const { error: insertError } = await supabase.from("messages").insert(testMessage);
  if (insertError) {
    console.error("  Insert failed:", insertError);
    return;
  }
  console.log("  Message inserted successfully");

  // Step 5: Query to verify
  console.log("\nStep 5: Verifying message in database...");
  const { data, error: queryError } = await supabase
    .from("messages")
    .select("*")
    .eq("wa_message_id", testMessage.wa_message_id)
    .single();

  if (queryError) {
    console.error("  Query failed:", queryError);
    return;
  }

  console.log("\n=== RESULT ===");
  console.log("Message ID:", data.id);
  console.log("Message Type:", data.message_type);
  console.log("Media URL:", data.media_url);
  console.log("Media MIME Type:", data.media_mime_type);
  console.log("File Name:", data.file_name);
  console.log("Caption:", data.media_caption);

  if (data.media_url && data.media_url.startsWith("http")) {
    console.log("\n✅ SUCCESS: media_url is populated with a valid URL");
  } else {
    console.log("\n❌ FAILED: media_url is null or invalid");
  }
}

testMediaProcessing();
