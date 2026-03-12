import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (nb.includes(na) || na.includes(nb)) return 0.8;
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
    headers: { "Content-Type": "application/json", "Client-Token": clientToken },
    body: JSON.stringify({ phone, message }),
  });
  console.log("Z-API send-text response:", resp.status, await resp.text());
}

async function parseWithAI(messageText: string) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `Voce extrai dados de compras de insumos de restaurante a partir de mensagens em portugues.
Extraia: produto, quantidade, unidade (kg, un, L, g, ml, etc), valor_total, fornecedor (se mencionado).
REGRA IMPORTANTE: So chame a funcao register_purchase se a mensagem contiver EXPLICITAMENTE os tres dados: produto, quantidade E valor/preco. Se faltar qualquer um desses dados, NAO chame a funcao. Exemplos que NAO devem chamar a funcao: "arroz", "10kg arroz", "arroz 60 reais". Exemplo valido: "10kg arroz 60 reais".`,
        },
        { role: "user", content: messageText },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "register_purchase",
            description: "Registra dados de uma compra extraidos da mensagem. So chame se produto, quantidade e valor estiverem TODOS presentes na mensagem.",
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
      tool_choice: "auto",
    }),
  });

  if (!response.ok) {
    console.error("AI error:", response.status, await response.text());
    return null;
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) return null;

  try {
    return JSON.parse(toolCall.function.arguments) as {
      produto: string; quantidade: number; unidade: string; valor_total: number; fornecedor: string | null;
    };
  } catch {
    console.error("Failed to parse AI response:", toolCall.function.arguments);
    return null;
  }
}

function getSupabase() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function findProduct(supabase: ReturnType<typeof createClient>, productName: string) {
  const { data: products, error } = await supabase
    .from("products").select("id, name, unit").eq("is_active", true);
  if (error || !products) return null;

  let bestMatch: { id: string; name: string; unit: string } | null = null;
  let bestScore = 0;
  for (const p of products) {
    const score = similarity(productName, p.name);
    if (score > bestScore) { bestScore = score; bestMatch = p; }
  }

  if (!bestMatch || bestScore < 0.4) {
    const { data: ilikeProd } = await supabase
      .from("products").select("id, name, unit").eq("is_active", true)
      .ilike("name", `%${normalize(productName)}%`).limit(1);
    if (ilikeProd?.length) { bestMatch = ilikeProd[0]; bestScore = 0.6; }
  }

  return bestScore >= 0.3 ? bestMatch : null;
}

async function getActiveSuppliers(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase.from("suppliers").select("id, name").eq("is_active", true).order("name");
  return data || [];
}

async function findSupplier(supabase: ReturnType<typeof createClient>, supplierName: string) {
  const { data } = await supabase
    .from("suppliers").select("id, name").eq("is_active", true)
    .ilike("name", `%${normalize(supplierName)}%`).limit(1);
  return data?.[0] || null;
}

async function insertPurchase(
  supabase: ReturnType<typeof createClient>,
  productId: string, quantity: number, totalPrice: number,
  supplierId: string | null, message: string
) {
  return supabase.from("purchase_history").insert({
    product_id: productId, quantity, total_price: totalPrice,
    supplier_id: supplierId, purchase_date: new Date().toISOString().split("T")[0],
    notes: `Via WhatsApp: "${message}"`,
  });
}

function buildConfirmation(
  productName: string, quantity: number, unit: string,
  totalPrice: number, supplierName: string | null
) {
  const unitPrice = totalPrice / quantity;
  return `✅ *Compra registrada!*\n\n📦 *Produto:* ${productName}\n📊 *Quantidade:* ${quantity} ${unit}\n💰 *Total:* R$ ${totalPrice.toFixed(2)}\n📈 *Preço unit:* R$ ${unitPrice.toFixed(2)}/${unit}${supplierName ? `\n🏪 *Fornecedor:* ${supplierName}` : ""}\n\n_Estoque atualizado automaticamente._`;
}

async function handleConfirmation(
  supabase: ReturnType<typeof createClient>, phone: string, messageText: string,
  pending: { id: string; product_id: string; quantity: number; total_price: number; unit: string; message_original: string }
) {
  const answer = normalize(messageText);
  
  if (answer === "sim" || answer === "s" || answer === "1") {
    // User confirmed — move to supplier selection
    await supabase.from("pending_whatsapp_purchases").update({ status: "awaiting_supplier" }).eq("id", pending.id);
    
    const suppliers = await getActiveSuppliers(supabase);
    const { data: product } = await supabase.from("products").select("name").eq("id", pending.product_id).single();
    
    let msg = `👍 Confirmado! *${product?.name}* — ${pending.quantity} ${pending.unit} — R$ ${pending.total_price.toFixed(2)}\n\n`;
    msg += `🏪 *Escolha o fornecedor:*\n`;
    suppliers.forEach((s, i) => { msg += `${i + 1} - ${s.name}\n`; });
    msg += `0 - Nenhum\n\n_Responda com o número._`;
    
    await sendWhatsApp(phone, msg);
    return { ok: true, awaiting_supplier: true };
  }
  
  if (answer === "nao" || answer === "n" || answer === "não" || answer === "0") {
    await supabase.from("pending_whatsapp_purchases").delete().eq("id", pending.id);
    await sendWhatsApp(phone, "❌ Compra cancelada. Envie novamente com os dados corretos.");
    return { ok: true, cancelled: true };
  }
  
  await sendWhatsApp(phone, "🔄 Responda *Sim* para confirmar ou *Não* para cancelar.");
  return { ok: true, awaiting_confirmation: true };
}

async function handleSupplierSelection(
  supabase: ReturnType<typeof createClient>, phone: string, messageText: string,
  pending: { id: string; product_id: string; quantity: number; total_price: number; unit: string; message_original: string }
) {
  const choice = messageText.trim();
  const num = parseInt(choice, 10);

  if (isNaN(num) || num < 0) {
    await sendWhatsApp(phone, "❌ Responda com o *número* do fornecedor ou *0* para nenhum.");
    return { ok: true, awaiting_supplier: true };
  }

  const suppliers = await getActiveSuppliers(supabase);
  let supplierId: string | null = null;
  let supplierName: string | null = null;

  if (num > 0) {
    if (num > suppliers.length) {
      await sendWhatsApp(phone, `❌ Número inválido. Escolha de 0 a ${suppliers.length}.`);
      return { ok: true, awaiting_supplier: true };
    }
    supplierId = suppliers[num - 1].id;
    supplierName = suppliers[num - 1].name;
  }

  const { data: product } = await supabase.from("products").select("name").eq("id", pending.product_id).single();

  const { error: insertError } = await insertPurchase(
    supabase, pending.product_id, pending.quantity, pending.total_price, supplierId, pending.message_original
  );

  if (insertError) {
    console.error("Insert error:", insertError);
    await sendWhatsApp(phone, "❌ Erro ao registrar a compra.");
    return { ok: false, error: "insert_failed" };
  }

  await supabase.from("pending_whatsapp_purchases").delete().eq("id", pending.id);

  await sendWhatsApp(phone, buildConfirmation(
    product?.name || "Produto", pending.quantity, pending.unit, pending.total_price, supplierName
  ));

  return { ok: true, product: product?.name, supplier: supplierName };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("Webhook received:", JSON.stringify(body).substring(0, 500));

    if (body.fromMe || body.isGroup || body.isStatusReply) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messageText = body.text?.message || body.message?.text || body.text || "";
    const phone = body.phone || body.from || "";
    if (!messageText || !phone) {
      return new Response(JSON.stringify({ ok: true, no_content: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Message from ${phone}: ${messageText}`);
    const supabase = getSupabase();

    // 1. Check for pending purchase (supplier selection)
    const { data: pendingList } = await supabase
      .from("pending_whatsapp_purchases")
      .select("*")
      .eq("phone", phone)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (pendingList?.length) {
      const pending = pendingList[0];
      if (pending.status === "awaiting_confirmation") {
        const result = await handleConfirmation(supabase, phone, messageText, pending);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (pending.status === "awaiting_supplier") {
        const result = await handleSupplierSelection(supabase, phone, messageText, pending);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 2. Parse new purchase with AI
    const parsed = await parseWithAI(messageText);
    if (!parsed || !parsed.quantidade || parsed.quantidade <= 0 || !parsed.valor_total || parsed.valor_total <= 0) {
      await sendWhatsApp(phone, "❌ Não consegui identificar todos os dados da compra. Envie no formato:\n\n_10kg arroz 60 reais_\n_5 unidades alho 15_\n\nInforme *produto*, *quantidade* e *valor*.");
      return new Response(JSON.stringify({ ok: true, not_purchase: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Parsed:", JSON.stringify(parsed));

    // 3. Find product
    const product = await findProduct(supabase, parsed.produto);
    if (!product) {
      await sendWhatsApp(phone, `❌ Produto "${parsed.produto}" não encontrado no sistema.\n\nVerifique o nome e tente novamente.`);
      return new Response(JSON.stringify({ ok: false, error: "product_not_found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Handle supplier
    if (parsed.fornecedor) {
      const supplier = await findSupplier(supabase, parsed.fornecedor);
      if (supplier) {
        // Supplier found — register directly
        const { error } = await insertPurchase(supabase, product.id, parsed.quantidade, parsed.valor_total, supplier.id, messageText);
        if (error) {
          await sendWhatsApp(phone, "❌ Erro ao registrar a compra.");
          return new Response(JSON.stringify({ ok: false, error: "insert_failed" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        await sendWhatsApp(phone, buildConfirmation(product.name, parsed.quantidade, parsed.unidade, parsed.valor_total, supplier.name));
        return new Response(JSON.stringify({ ok: true, product: product.name, supplier: supplier.name }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        // Supplier mentioned but not found — warn and ask to select
        await sendWhatsApp(phone, `⚠️ Fornecedor "${parsed.fornecedor}" não encontrado.`);
      }
    }

    // 5. No supplier or not found — save pending & ask
    const suppliers = await getActiveSuppliers(supabase);

    // Clean old pendings for this phone
    await supabase.from("pending_whatsapp_purchases").delete().eq("phone", phone);

    // Save pending
    await supabase.from("pending_whatsapp_purchases").insert({
      phone, product_id: product.id, quantity: parsed.quantidade,
      total_price: parsed.valor_total, unit: parsed.unidade, message_original: messageText,
    });

    // Build supplier list
    let msg = `📦 *${product.name}* — ${parsed.quantidade} ${parsed.unidade} — R$ ${parsed.valor_total.toFixed(2)}\n\n`;
    msg += `🏪 *Escolha o fornecedor:*\n`;
    suppliers.forEach((s, i) => { msg += `${i + 1} - ${s.name}\n`; });
    msg += `0 - Nenhum\n\n_Responda com o número._`;

    await sendWhatsApp(phone, msg);

    return new Response(JSON.stringify({ ok: true, awaiting_supplier: true, product: product.name }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
