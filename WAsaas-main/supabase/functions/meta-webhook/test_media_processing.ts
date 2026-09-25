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

  // Step 3: Resolve a fetchable URL from the storage path
  console.log("\nStep 3: Resolving a fetchable URL...");
  const { data: signedData } = await supabase.storage
    .from("whatsapp-media")
    .createSignedUrl(storagePath, 60 * 60);

  const fetchableUrl = signedData?.signedUrl
    || supabase.storage.from("whatsapp-media").getPublicUrl(storagePath).data?.publicUrl;
  console.log("  Fetchable URL:", fetchableUrl);

  if (!fetchableUrl) {
    console.error("  Failed to resolve a URL for the stored object");
    return;
  }

  const headRes = await fetch(fetchableUrl);
  console.log(`  URL responded ${headRes.status}`);

  // Step 4: Insert test message. media_url holds the storage PATH — the same
  // convention used by api/meta-webhook.js and the meta-webhook Edge Function.
  // api/messages.js turns it into a signed URL for the browser.
  console.log("\nStep 4: Inserting test message...");
  const testMessage = {
    wa_message_id: "test_msg_" + Date.now(),
    sender_number: testPhone,
    content: "📎 Image message",
    message_type: "image",
    direction: "inbound",
    received_at: new Date().toISOString(),
    media_url: storagePath,
    media_mime_type: mimeType,
    file_name: "test_image.jpg",
    media_caption: "Test image caption",
    media_size: buffer.byteLength,
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
  console.log("Media URL (storage path):", data.media_url);
  console.log("Media MIME Type:", data.media_mime_type);
  console.log("File Name:", data.file_name);
  console.log("Caption:", data.media_caption);

  const ok = data.media_url === storagePath && headRes.ok;
  console.log(
    ok
      ? "\n✅ SUCCESS: storage path persisted and the resolved URL is reachable"
      : "\n❌ FAILED: media_url mismatch or the resolved URL was not reachable",
  );

  // Step 6: Clean up the test row and object so repeated runs stay tidy
  console.log("\nStep 6: Cleaning up test data...");
  await supabase.from("messages").delete().eq("wa_message_id", testMessage.wa_message_id);
  await supabase.storage.from("whatsapp-media").remove([storagePath]);
  console.log("  Cleanup done");
}

testMediaProcessing();
