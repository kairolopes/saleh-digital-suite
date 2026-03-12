import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STOPWORDS = new Set(["e", "de", "da", "do", "das", "dos", "com", "em", "no", "na", "um", "uma", "o", "a", "os", "as", "por"]);

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOPWORDS.has(w));
}

/** Score how well `query` matches `candidate` product name. Returns 0-1. */
function scoreProduct(query: string, candidateName: string): number {
  const nq = normalize(query);
  const nc = normalize(candidateName);

  // Tier 1: exact match
  if (nq === nc) return 1.0;

  // Tier 2: candidate starts with query or query starts with candidate
  if (nc.startsWith(nq)) return 0.9;
  if (nq.startsWith(nc)) return 0.85;

  // Tier 3: candidate contains query as substring
  if (nc.includes(nq)) return 0.8;

  // Tier 4: token overlap (only meaningful tokens)
  const queryTokens = tokenize(query);
  const candidateTokens = tokenize(candidateName);
  if (queryTokens.length === 0) return 0;

  let matchedTokens = 0;
  for (const qt of queryTokens) {
    if (candidateTokens.some(ct => ct === qt || ct.startsWith(qt) || qt.startsWith(ct))) {
      matchedTokens++;
    }
  }

  const coverage = matchedTokens / queryTokens.length;
  // Scale token overlap to 0.3-0.7 range
  return coverage * 0.7;
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

interface ProductMatch { id: string; name: string; unit: string; score: number }

/** Find matching products. Returns sorted list of candidates above threshold. */
async function findProducts(supabase: ReturnType<typeof getSupabase>, productName: string): Promise<ProductMatch[]> {
  const { data: products, error } = await supabase
    .from("products").select("id, name, unit").eq("is_active", true);
  if (error || !products) return [];

  const scored: ProductMatch[] = [];
  for (const p of products) {
    const score = scoreProduct(productName, p.name);
    if (score >= 0.3) {
      scored.push({ id: p.id, name: p.name, unit: p.unit, score });
    }
  }

  // Also try ilike fallback
  if (scored.length === 0) {
    const nq = normalize(productName);
    const { data: ilikeProd } = await supabase
      .from("products").select("id, name, unit").eq("is_active", true)
      .ilike("name", `%${nq}%`);
    if (ilikeProd?.length) {
      for (const p of ilikeProd) {
        scored.push({ id: p.id, name: p.name, unit: p.unit, score: 0.6 });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);
  console.log(`Product matching for "${productName}":`, JSON.stringify(scored.slice(0, 5)));
  return scored;
}

async function getActiveSuppliers(supabase: ReturnType<typeof getSupabase>) {
  const { data } = await supabase.from("suppliers").select("id, name").eq("is_active", true).order("name");
  return data || [];
}

async function insertPurchase(
  supabase: ReturnType<typeof getSupabase>,
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

// --- State handlers ---

type Pending = {
  id: string; product_id: string; quantity: number; total_price: number;
  unit: string; message_original: string; product_options: any; supplier_id: string | null;
};

async function handleProductChoice(
  supabase: ReturnType<typeof getSupabase>, phone: string, messageText: string, pending: Pending
) {
  const options: { id: string; name: string }[] = pending.product_options || [];
  let chosen: { id: string; name: string } | null = null;

  const num = parseInt(messageText.trim(), 10);
  if (!isNaN(num) && num >= 1 && num <= options.length) {
    chosen = options[num - 1];
  } else {
    // Semantic search against the available options
    const scored = options
      .map(o => ({ ...o, score: scoreProduct(messageText, o.name) }))
      .filter(o => o.score >= 0.5)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 1 || (scored.length > 1 && scored[0].score - scored[1].score >= 0.15)) {
      chosen = scored[0];
    } else if (scored.length > 1) {
      let msg = `🔍 Ainda ambíguo. Seja mais específico ou escolha pelo número:\n\n`;
      options.forEach((o, i) => { msg += `${i + 1} - ${o.name}\n`; });
      msg += `\n_Responda com o número ou o nome._`;
      await sendWhatsApp(phone, msg);
      return { ok: true, awaiting_product_choice: true };
    } else {
      let msg = `❌ Não encontrei esse produto na lista. Escolha pelo número:\n\n`;
      options.forEach((o, i) => { msg += `${i + 1} - ${o.name}\n`; });
      msg += `\n_Responda com o número ou o nome._`;
      await sendWhatsApp(phone, msg);
      return { ok: true, awaiting_product_choice: true };
    }
  }

  // Product chosen — now check if supplier still needs resolving
  if (!pending.supplier_id) {
    // No supplier resolved yet — ask for supplier before confirmation
    await supabase.from("pending_whatsapp_purchases").update({
      product_id: chosen.id,
      status: "awaiting_supplier",
      product_options: null,
    }).eq("id", pending.id);

    const suppliers = await getActiveSuppliers(supabase);
    let msg = `✅ Produto: *${chosen.name}*\n\n`;
    msg += `🏪 *Escolha o fornecedor:*\n`;
    suppliers.forEach((s, i) => { msg += `${i + 1} - ${s.name}\n`; });
    msg += `0 - Nenhum\n\n_Responda com o número ou o nome._`;

    await sendWhatsApp(phone, msg);
    return { ok: true, awaiting_supplier: true };
  }

  // Supplier already resolved — go straight to confirmation
  await supabase.from("pending_whatsapp_purchases").update({
    product_id: chosen.id,
    status: "awaiting_confirmation",
    product_options: null,
  }).eq("id", pending.id);

  const { data: supplier } = await supabase.from("suppliers").select("name").eq("id", pending.supplier_id).single();
  const unitPrice = pending.total_price / pending.quantity;
  let msg = `🔍 *Confira os dados da compra:*\n\n`;
  msg += `📦 *Produto:* ${chosen.name}\n`;
  msg += `📊 *Quantidade:* ${pending.quantity} ${pending.unit}\n`;
  msg += `💰 *Valor total:* R$ ${pending.total_price.toFixed(2)}\n`;
  msg += `📈 *Preço unit:* R$ ${unitPrice.toFixed(2)}/${pending.unit}\n`;
  if (supplier?.name) msg += `🏪 *Fornecedor:* ${supplier.name}\n`;
  msg += `\n✅ Responda *Sim* para confirmar ou *Não* para cancelar.`;

  await sendWhatsApp(phone, msg);
  return { ok: true, awaiting_confirmation: true };
}

async function handleConfirmation(
  supabase: ReturnType<typeof getSupabase>, phone: string, messageText: string, pending: Pending
) {
  const answer = normalize(messageText);

  if (answer === "sim" || answer === "s" || answer === "1") {
    // At this point, supplier should already be resolved (or intentionally null/nenhum)
    const { data: product } = await supabase.from("products").select("name").eq("id", pending.product_id).single();
    let supplierName: string | null = null;
    if (pending.supplier_id) {
      const { data: supplier } = await supabase.from("suppliers").select("name").eq("id", pending.supplier_id).single();
      supplierName = supplier?.name || null;
    }

    const { error: insertError } = await insertPurchase(
      supabase, pending.product_id, pending.quantity, pending.total_price,
      pending.supplier_id, pending.message_original
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

  if (answer === "nao" || answer === "n" || answer === "não" || answer === "0") {
    await supabase.from("pending_whatsapp_purchases").delete().eq("id", pending.id);
    await sendWhatsApp(phone, "❌ Compra cancelada. Envie novamente com os dados corretos.");
    return { ok: true, cancelled: true };
  }

  await sendWhatsApp(phone, "🔄 Responda *Sim* para confirmar ou *Não* para cancelar.");
  return { ok: true, awaiting_confirmation: true };
}

async function handleSupplierSelection(
  supabase: ReturnType<typeof getSupabase>, phone: string, messageText: string, pending: Pending
) {
  const suppliers = await getActiveSuppliers(supabase);
  let supplierId: string | null = null;
  let supplierName: string | null = null;

  const answer = normalize(messageText);
  if (answer === "nenhum" || answer === "nenhuma" || answer === "sem fornecedor") {
    // Treat as "0"
  } else {
    const num = parseInt(messageText.trim(), 10);
    if (!isNaN(num) && num >= 0) {
      if (num === 0) {
        // No supplier
      } else if (num > suppliers.length) {
        await sendWhatsApp(phone, `❌ Número inválido. Escolha de 0 a ${suppliers.length}.`);
        return { ok: true, awaiting_supplier: true };
      } else {
        supplierId = suppliers[num - 1].id;
        supplierName = suppliers[num - 1].name;
      }
    } else {
      // Semantic search against suppliers
      const scored = suppliers
        .map(s => ({ ...s, score: scoreProduct(messageText, s.name) }))
        .filter(s => s.score >= 0.5)
        .sort((a, b) => b.score - a.score);

      if (scored.length === 1 || (scored.length > 1 && scored[0].score - scored[1].score >= 0.15)) {
        supplierId = scored[0].id;
        supplierName = scored[0].name;
      } else if (scored.length > 1) {
        let msg = `🔍 Encontrei mais de um fornecedor parecido. Escolha pelo número:\n\n`;
        suppliers.forEach((s, i) => { msg += `${i + 1} - ${s.name}\n`; });
        msg += `0 - Nenhum\n\n_Responda com o número ou o nome._`;
        await sendWhatsApp(phone, msg);
        return { ok: true, awaiting_supplier: true };
      } else {
        let msg = `❌ Fornecedor não encontrado. Escolha pelo número:\n\n`;
        suppliers.forEach((s, i) => { msg += `${i + 1} - ${s.name}\n`; });
        msg += `0 - Nenhum\n\n_Responda com o número ou o nome._`;
        await sendWhatsApp(phone, msg);
        return { ok: true, awaiting_supplier: true };
      }
    }
  }

  // Supplier resolved — save and move to confirmation
  await supabase.from("pending_whatsapp_purchases").update({
    supplier_id: supplierId,
    status: "awaiting_confirmation",
  }).eq("id", pending.id);

  const { data: product } = await supabase.from("products").select("name").eq("id", pending.product_id).single();

  const unitPrice = pending.total_price / pending.quantity;
  let msg = `🔍 *Confira os dados da compra:*\n\n`;
  msg += `📦 *Produto:* ${product?.name}\n`;
  msg += `📊 *Quantidade:* ${pending.quantity} ${pending.unit}\n`;
  msg += `💰 *Valor total:* R$ ${pending.total_price.toFixed(2)}\n`;
  msg += `📈 *Preço unit:* R$ ${unitPrice.toFixed(2)}/${pending.unit}\n`;
  if (supplierName) msg += `🏪 *Fornecedor:* ${supplierName}\n`;
  msg += `\n✅ Responda *Sim* para confirmar ou *Não* para cancelar.`;

  await sendWhatsApp(phone, msg);
  return { ok: true, awaiting_confirmation: true };
}

// --- Main handler ---

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

    // 1. Check for pending interactions
    const { data: pendingList } = await supabase
      .from("pending_whatsapp_purchases")
      .select("*")
      .eq("phone", phone)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (pendingList?.length) {
      const pending = pendingList[0];
      let result;

      if (pending.status === "awaiting_product_choice") {
        result = await handleProductChoice(supabase, phone, messageText, pending);
      } else if (pending.status === "awaiting_confirmation") {
        result = await handleConfirmation(supabase, phone, messageText, pending);
      } else if (pending.status === "awaiting_supplier") {
        result = await handleSupplierSelection(supabase, phone, messageText, pending);
      }

      if (result) {
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

    // 3. Find product candidates
    const candidates = await findProducts(supabase, parsed.produto);

    if (candidates.length === 0) {
      await sendWhatsApp(phone, `❌ Produto "${parsed.produto}" não encontrado no sistema.\n\nVerifique o nome e tente novamente.`);
      return new Response(JSON.stringify({ ok: false, error: "product_not_found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clean old pendings
    await supabase.from("pending_whatsapp_purchases").delete().eq("phone", phone);

    const CONFIDENCE_THRESHOLD = 0.8;
    const AMBIGUITY_GAP = 0.15;
    const topScore = candidates[0].score;

    // Check if top match is confident and clearly ahead
    const isConfident = topScore >= CONFIDENCE_THRESHOLD;
    const closeRunners = candidates.filter(c => c.score >= topScore - AMBIGUITY_GAP);
    const isAmbiguous = closeRunners.length > 1;

    if (isConfident && !isAmbiguous) {
      // Single confident match -> go to confirmation
      const product = candidates[0];
      // Match supplier if extracted by AI
      let matchedSupplierId: string | null = null;
      if (parsed.fornecedor) {
        const suppliers = await getActiveSuppliers(supabase);
        const supplierScored = suppliers
          .map(s => ({ ...s, score: scoreProduct(parsed.fornecedor!, s.name) }))
          .filter(s => s.score >= 0.5)
          .sort((a, b) => b.score - a.score);
        if (supplierScored.length === 1 || (supplierScored.length > 1 && supplierScored[0].score - supplierScored[1].score >= 0.15)) {
          matchedSupplierId = supplierScored[0].id;
        }
      }

      await supabase.from("pending_whatsapp_purchases").insert({
        phone, product_id: product.id, quantity: parsed.quantidade,
        total_price: parsed.valor_total, unit: parsed.unidade, message_original: messageText,
        status: "awaiting_confirmation", supplier_id: matchedSupplierId,
      });

      const unitPrice = parsed.valor_total / parsed.quantidade;
      let msg = `🔍 *Confira os dados da compra:*\n\n`;
      msg += `📦 *Produto:* ${product.name}\n`;
      msg += `📊 *Quantidade:* ${parsed.quantidade} ${parsed.unidade}\n`;
      msg += `💰 *Valor total:* R$ ${parsed.valor_total.toFixed(2)}\n`;
      msg += `📈 *Preço unit:* R$ ${unitPrice.toFixed(2)}/${parsed.unidade}\n`;
      if (parsed.fornecedor) msg += `🏪 *Fornecedor:* ${parsed.fornecedor}\n`;
      msg += `\n✅ Responda *Sim* para confirmar ou *Não* para cancelar.`;

      await sendWhatsApp(phone, msg);
      return new Response(JSON.stringify({ ok: true, awaiting_confirmation: true, product: product.name }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // Ambiguous or low confidence -> ask user to choose product
      const options = closeRunners.slice(0, 5); // max 5 options

      // Reuse matchedSupplierId from above (supplier matching already done for confident path)
      let ambiguousSupplierId: string | null = null;
      if (parsed.fornecedor) {
        const suppliers = await getActiveSuppliers(supabase);
        const supplierScored = suppliers
          .map(s => ({ ...s, score: scoreProduct(parsed.fornecedor!, s.name) }))
          .filter(s => s.score >= 0.5)
          .sort((a, b) => b.score - a.score);
        if (supplierScored.length === 1 || (supplierScored.length > 1 && supplierScored[0].score - supplierScored[1].score >= 0.15)) {
          ambiguousSupplierId = supplierScored[0].id;
        }
      }

      await supabase.from("pending_whatsapp_purchases").insert({
        phone, product_id: options[0].id, quantity: parsed.quantidade,
        total_price: parsed.valor_total, unit: parsed.unidade, message_original: messageText,
        status: "awaiting_product_choice",
        product_options: options.map(o => ({ id: o.id, name: o.name })),
        supplier_id: ambiguousSupplierId,
      });

      let msg = `🔍 Encontrei mais de um produto parecido com "*${parsed.produto}*".\n\n`;
      msg += `📋 *Qual é o produto correto?*\n`;
      options.forEach((o, i) => { msg += `${i + 1} - ${o.name}\n`; });
      msg += `\n_Responda com o número ou o nome._`;

      await sendWhatsApp(phone, msg);
      return new Response(JSON.stringify({ ok: true, awaiting_product_choice: true, candidates: options.map(o => o.name) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
