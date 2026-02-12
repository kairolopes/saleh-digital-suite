import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (nb.includes(na) || na.includes(nb)) return 0.8;
  // Check word overlap
  const wordsA = na.split(/\s+/);
  const wordsB = nb.split(/\s+/);
  let matches = 0;
  for (const w of wordsA) {
    if (w.length < 3) continue;
    if (wordsB.some((wb) => wb.includes(w) || w.includes(wb))) matches++;
  }
  return wordsA.length > 0 ? matches / wordsA.length : 0;
}

async function sendWhatsApp(phone: string, message: string) {
  const instanceId = Deno.env.get("ZAPI_INSTANCE_ID")!;
  const token = Deno.env.get("ZAPI_TOKEN")!;
  const clientToken = Deno.env.get("ZAPI_CLIENT_TOKEN")!;

  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Token": clientToken,
    },
    body: JSON.stringify({ phone, message }),
  });
  console.log("Z-API send-text response:", resp.status, await resp.text());
}

async function parseWithAI(messageText: string): Promise<{
  produto: string;
  quantidade: number;
  unidade: string;
  valor_total: number;
  fornecedor: string | null;
} | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const response = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Voce extrai dados de compras de insumos de restaurante a partir de mensagens em portugues.
Extraia: produto, quantidade, unidade (kg, un, L, g, ml, etc), valor_total, fornecedor (se mencionado).
Use tool calling para retornar os dados estruturados. Se a mensagem nao for sobre compra, retorne null.`,
          },
          { role: "user", content: messageText },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "register_purchase",
              description: "Registra dados de uma compra extraidos da mensagem",
              parameters: {
                type: "object",
                properties: {
                  produto: { type: "string", description: "Nome do produto/insumo" },
                  quantidade: { type: "number", description: "Quantidade comprada" },
                  unidade: { type: "string", description: "Unidade (kg, un, L, g, ml)" },
                  valor_total: { type: "number", description: "Valor total pago em reais" },
                  fornecedor: { type: ["string", "null"], description: "Nome do fornecedor se mencionado" },
                },
                required: ["produto", "quantidade", "unidade", "valor_total"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "register_purchase" } },
      }),
    }
  );

  if (!response.ok) {
    console.error("AI error:", response.status, await response.text());
    return null;
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) return null;

  try {
    return JSON.parse(toolCall.function.arguments);
  } catch {
    console.error("Failed to parse AI response:", toolCall.function.arguments);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("Webhook received:", JSON.stringify(body).substring(0, 500));

    // Z-API webhook structure: check for message
    const isFromMe = body.fromMe;
    const isGroup = body.isGroup;
    const isStatus = body.isStatusReply;

    // Filter: ignore sent messages, groups, status replies
    if (isFromMe || isGroup || isStatus) {
      console.log("Ignored: fromMe=", isFromMe, "isGroup=", isGroup, "isStatus=", isStatus);
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract message text
    const messageText =
      body.text?.message || body.message?.text || body.text || "";
    const phone = body.phone || body.from || "";

    if (!messageText || !phone) {
      console.log("No message text or phone");
      return new Response(JSON.stringify({ ok: true, no_content: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Message from ${phone}: ${messageText}`);

    // Parse with AI
    const parsed = await parseWithAI(messageText);
    if (!parsed) {
      await sendWhatsApp(
        phone,
        "❌ Não consegui entender a mensagem como uma compra. Envie no formato:\n\n_10kg arroz 60 reais_\n_5 unidades alho 15_"
      );
      return new Response(JSON.stringify({ ok: true, not_purchase: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Parsed:", JSON.stringify(parsed));

    // Connect to Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Load all products
    const { data: products, error: prodError } = await supabase
      .from("products")
      .select("id, name, unit")
      .eq("is_active", true);

    if (prodError || !products) {
      console.error("Error loading products:", prodError);
      await sendWhatsApp(phone, "❌ Erro ao buscar produtos no sistema.");
      return new Response(JSON.stringify({ ok: false, error: "products" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find best match
    let bestMatch: { id: string; name: string; unit: string } | null = null;
    let bestScore = 0;

    for (const p of products) {
      const score = similarity(parsed.produto, p.name);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = p;
      }
    }

    if (!bestMatch || bestScore < 0.4) {
      // Try ILIKE fallback
      const searchTerm = normalize(parsed.produto);
      const { data: ilikeProd } = await supabase
        .from("products")
        .select("id, name, unit")
        .eq("is_active", true)
        .ilike("name", `%${searchTerm}%`)
        .limit(1);

      if (ilikeProd && ilikeProd.length > 0) {
        bestMatch = ilikeProd[0];
        bestScore = 0.6;
      }
    }

    if (!bestMatch || bestScore < 0.3) {
      await sendWhatsApp(
        phone,
        `❌ Produto "${parsed.produto}" não encontrado no sistema.\n\nVerifique o nome e tente novamente.`
      );
      return new Response(
        JSON.stringify({ ok: false, error: "product_not_found", parsed }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find supplier if mentioned
    let supplierId: string | null = null;
    if (parsed.fornecedor) {
      const { data: suppliers } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("is_active", true)
        .ilike("name", `%${normalize(parsed.fornecedor)}%`)
        .limit(1);

      if (suppliers && suppliers.length > 0) {
        supplierId = suppliers[0].id;
      }
    }

    // Calculate unit price
    const unitPrice = parsed.valor_total / parsed.quantidade;

    // Insert purchase
    const { error: insertError } = await supabase
      .from("purchase_history")
      .insert({
        product_id: bestMatch.id,
        quantity: parsed.quantidade,
        total_price: parsed.valor_total,
        supplier_id: supplierId,
        purchase_date: new Date().toISOString().split("T")[0],
        notes: `Via WhatsApp: "${messageText}"`,
      });

    if (insertError) {
      console.error("Insert error:", insertError);
      await sendWhatsApp(phone, "❌ Erro ao registrar a compra no sistema.");
      return new Response(
        JSON.stringify({ ok: false, error: "insert_failed" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Send confirmation
    const confirmMsg = `✅ *Compra registrada!*\n\n📦 *Produto:* ${bestMatch.name}\n📊 *Quantidade:* ${parsed.quantidade} ${parsed.unidade}\n💰 *Total:* R$ ${parsed.valor_total.toFixed(2)}\n📈 *Preço unit:* R$ ${unitPrice.toFixed(2)}/${parsed.unidade}${supplierId ? `\n🏪 *Fornecedor:* ${parsed.fornecedor}` : ""}\n\n_Estoque atualizado automaticamente._`;

    await sendWhatsApp(phone, confirmMsg);

    return new Response(
      JSON.stringify({
        ok: true,
        product: bestMatch.name,
        quantity: parsed.quantidade,
        total: parsed.valor_total,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
