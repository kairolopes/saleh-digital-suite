import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STOPWORDS = new Set(["e", "de", "da", "do", "das", "dos", "com", "em", "no", "na", "um", "uma", "o", "a", "os", "as", "por", "ltda", "me", "epp", "sa"]);

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}
function tokenize(text: string): string[] {
  return normalize(text).split(/[\s\.\-_,]+/).filter(w => w.length >= 2 && !STOPWORDS.has(w));
}
function scoreProduct(query: string, candidateName: string): number {
  const nq = normalize(query);
  const nc = normalize(candidateName);
  if (nq === nc) return 1.0;
  if (nc.startsWith(nq)) return 0.9;
  if (nq.startsWith(nc)) return 0.85;
  if (nc.includes(nq)) return 0.8;
  const queryTokens = tokenize(query);
  const candidateTokens = tokenize(candidateName);
  if (queryTokens.length === 0) return 0;
  let matched = 0;
  for (const qt of queryTokens) {
    if (candidateTokens.some(ct => ct === qt || ct.startsWith(qt) || qt.startsWith(ct))) matched++;
  }
  return (matched / queryTokens.length) * 0.7;
}
function normalizeCnpj(c?: string | null): string | null {
  if (!c) return null;
  const d = c.replace(/\D/g, "");
  return d.length === 14 ? d : null;
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
  console.log("Z-API send-text:", resp.status, await resp.text());
}

async function downloadAsBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) { console.error("download failed", resp.status); return null; }
    const contentType = (resp.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
    const buffer = await resp.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return { base64: btoa(binary), mimeType: contentType };
  } catch (e) { console.error("download error", e); return null; }
}

type ParsedItem = { produto: string; quantidade: number; unidade: string; valor_total: number };
type ParsedBatch = {
  itens: ParsedItem[];
  fornecedor_nome: string | null;
  fornecedor_cnpj: string | null;
};

async function parseMediaWithAI(base64: string, mimeType: string, caption?: string): Promise<ParsedBatch | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  const isPdf = mimeType === "application/pdf";
  const userContent: any[] = [];
  // Both images and PDFs are passed via image_url data-URI on the gateway (multimodal)
  userContent.push({
    type: "image_url",
    image_url: { url: `data:${mimeType};base64,${base64}` },
  });
  userContent.push({
    type: "text",
    text: caption
      ? `Analise este ${isPdf ? "PDF" : "documento/imagem"} de compra/nota fiscal. Comentário do usuário: "${caption}". Extraia TODOS os itens.`
      : `Analise este ${isPdf ? "PDF" : "documento/imagem"} de compra/nota fiscal/cupom. Extraia TODOS os itens visíveis.`,
  });

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        {
          role: "system",
          content: `Voce extrai TODOS os itens de uma nota fiscal, cupom, recibo ou foto de compra de insumos.
REGRAS:
- Extraia CADA item separadamente, com nome, quantidade, unidade e valor total da linha.
- Use ponto como separador decimal interno (mas aceite "2,50" da nota como 2.50).
- Unidades validas: kg, g, L, mL, un, cx, fd, pct, dz, sc, gl, bd, lta, gf
- Se a unidade nao for clara, use "un".
- Identifique o EMITENTE da nota (razao social) e o CNPJ se visivel. Ignore destinatario/cliente.
- Ignore subtotais, totais gerais, descontos, taxas, frete - so produtos.
- Se a midia nao for nota/compra, NAO chame a funcao.`,
        },
        { role: "user", content: userContent },
      ],
      tools: [{
        type: "function",
        function: {
          name: "register_purchase_batch",
          description: "Registra todos os itens de uma nota fiscal/compra.",
          parameters: {
            type: "object",
            properties: {
              fornecedor_nome: { type: ["string", "null"], description: "Razao social do emitente" },
              fornecedor_cnpj: { type: ["string", "null"], description: "CNPJ do emitente, so digitos ou formatado" },
              itens: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    produto: { type: "string" },
                    quantidade: { type: "number" },
                    unidade: { type: "string" },
                    valor_total: { type: "number", description: "Valor total da linha em reais" },
                  },
                  required: ["produto", "quantidade", "unidade", "valor_total"],
                  additionalProperties: false,
                },
              },
            },
            required: ["itens"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "register_purchase_batch" } },
    }),
  });

  if (!resp.ok) { console.error("AI media error", resp.status, await resp.text()); return null; }
  const data = await resp.json();
  const tc = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!tc) {
    console.warn("AI media: no tool_call. Raw:", JSON.stringify(data.choices?.[0]?.message)?.substring(0, 500));
    return null;
  }
  try {
    const raw = JSON.parse(tc.function.arguments);
    console.log("AI media parsed args:", JSON.stringify(raw).substring(0, 500));
    const itens: ParsedItem[] = [];
    for (const i of (raw.itens || [])) {
      const qty = Number(i.quantidade);
      let total = Number(i.valor_total);
      if ((!total || total <= 0) && i.valor_unitario && qty > 0) {
        total = Number(i.valor_unitario) * qty;
      }
      if (!i.produto || !(qty > 0) || !(total > 0)) {
        console.warn("Item midia descartado:", JSON.stringify(i));
        continue;
      }
      itens.push({
        produto: String(i.produto).trim(),
        quantidade: qty,
        unidade: String(i.unidade || "un"),
        valor_total: total,
      });
    }
    if (itens.length === 0) return null;
    return {
      itens,
      fornecedor_nome: raw.fornecedor_nome ?? null,
      fornecedor_cnpj: normalizeCnpj(raw.fornecedor_cnpj),
    };
  } catch (e) { console.error("parse media tool failed", e); return null; }
}

async function parseTextWithAI(messageText: string): Promise<ParsedBatch | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `Voce extrai compras de insumos a partir de mensagens em portugues. Pode haver UM OU MAIS itens.
- Aceite qualquer ordem das palavras. Virgula = decimal.
- Abreviacoes: cx caixa, fd fardo, pct pacote, un unidade, lt litro, dz duzia, sc saco, gl galao, bd balde, lta lata, gf garrafa, kg quilo, g grama.
- "X reais" / "R$ X" / "a X" = valor_total da compra inteira (nao unitario), salvo se disser "cada", "a unidade", "o kg".
- Se vier preco unitario explicito ("a 2,50 o kg", "cada um custa 5"), use valor_unitario e nao valor_total.
- Aceite QUALQUER valor numerico, mesmo que pareca alto (ex: 8000 reais por 20kg).
- Fornecedor opcional, mencionado por "no/na/do/comprei do".
- SEMPRE chame a tool register_purchase_batch, mesmo com 1 item. Se faltar info, chame mesmo assim com o que conseguir.
- Exemplos:
  "20kg cebola 8000 reais" -> {produto:"cebola", quantidade:20, unidade:"kg", valor_total:8000}
  "bife 10kg 8000 reais" -> {produto:"bife", quantidade:10, unidade:"kg", valor_total:8000}
  "oleo 24 unidades a 9000 reais" -> {produto:"oleo", quantidade:24, unidade:"un", valor_total:9000}
  "5kg arroz a 6 o kg" -> {produto:"arroz", quantidade:5, unidade:"kg", valor_unitario:6}`,
        },
        { role: "user", content: messageText },
      ],
      tools: [{
        type: "function",
        function: {
          name: "register_purchase_batch",
          description: "Registra um ou mais itens de compra extraidos da mensagem.",
          parameters: {
            type: "object",
            properties: {
              fornecedor_nome: { type: ["string", "null"] },
              itens: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    produto: { type: "string" },
                    quantidade: { type: "number" },
                    unidade: { type: "string" },
                    valor_total: { type: ["number", "null"] },
                    valor_unitario: { type: ["number", "null"] },
                  },
                  required: ["produto", "quantidade", "unidade"],
                  additionalProperties: false,
                },
              },
            },
            required: ["itens"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "register_purchase_batch" } },
    }),
  });
  if (!resp.ok) { console.error("AI text error", resp.status, await resp.text()); return null; }
  const data = await resp.json();
  const tc = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!tc) {
    console.warn("AI text: no tool_call. Raw message:", JSON.stringify(data.choices?.[0]?.message)?.substring(0, 500));
    return null;
  }
  try {
    const raw = JSON.parse(tc.function.arguments);
    console.log("AI text parsed args:", JSON.stringify(raw).substring(0, 500));
    const itens: ParsedItem[] = [];
    for (const i of (raw.itens || [])) {
      const qty = Number(i.quantidade);
      let total = Number(i.valor_total);
      if ((!total || total <= 0) && i.valor_unitario && qty > 0) {
        total = Number(i.valor_unitario) * qty;
      }
      if (!i.produto || !(qty > 0) || !(total > 0)) {
        console.warn("Item descartado pelo filtro:", JSON.stringify(i));
        continue;
      }
      itens.push({
        produto: String(i.produto).trim(),
        quantidade: qty,
        unidade: String(i.unidade || "un"),
        valor_total: total,
      });
    }
    if (itens.length === 0) return null;
    return { itens, fornecedor_nome: raw.fornecedor_nome ?? null, fornecedor_cnpj: null };
  } catch (e) { console.error("parse text tool failed", e); return null; }
}

function getSupabase() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

type ResolvedItem = {
  produto: string;
  quantidade: number;
  unidade: string;
  valor_total: number;
  product_id: string | null;
  product_name: string | null;
  needs_creation: boolean;
  ambiguous_options?: { id: string; name: string; hidden?: boolean }[];
  suggested_category_id?: string | null;
  excluded?: boolean;
  creation_confirmed?: boolean;
  is_hidden?: boolean;
  release_decided?: boolean;
};

async function resolveItems(supabase: ReturnType<typeof getSupabase>, items: ParsedItem[]): Promise<ResolvedItem[]> {
  const { data: products } = await supabase.from("products").select("id, name, unit, is_visible_in_recipes").eq("is_active", true);
  const list = products || [];
  const resolved: ResolvedItem[] = [];
  for (const it of items) {
    const scored = list
      .map(p => ({ ...p, score: scoreProduct(it.produto, p.name) }))
      .filter(s => s.score >= 0.5)
      .sort((a, b) => b.score - a.score);
    let r: ResolvedItem = {
      ...it,
      product_id: null, product_name: null, needs_creation: false,
    };
    if (scored.length > 0 && scored[0].score >= 0.8 && (scored.length === 1 || scored[0].score - scored[1].score >= 0.15)) {
      r.product_id = scored[0].id;
      r.product_name = scored[0].name;
      r.is_hidden = scored[0].is_visible_in_recipes === false;
    } else if (scored.length > 1) {
      r.ambiguous_options = scored.slice(0, 4).map(s => ({ id: s.id, name: s.name, hidden: s.is_visible_in_recipes === false }));
    } else {
      r.needs_creation = true;
    }
    resolved.push(r);
  }
  return resolved;
}

async function resolveSupplier(
  supabase: ReturnType<typeof getSupabase>,
  name: string | null, cnpj: string | null
): Promise<{ supplier_id: string | null; supplier_name: string | null; needs_alias: boolean }> {
  if (cnpj) {
    const { data: bySupCnpj } = await supabase.from("suppliers").select("id, name").eq("cnpj", cnpj).maybeSingle();
    if (bySupCnpj) return { supplier_id: bySupCnpj.id, supplier_name: bySupCnpj.name, needs_alias: false };
    const { data: byAliasCnpj } = await supabase.from("supplier_aliases").select("supplier_id, suppliers(name)").eq("cnpj", cnpj).maybeSingle();
    if (byAliasCnpj) return { supplier_id: byAliasCnpj.supplier_id, supplier_name: (byAliasCnpj as any).suppliers?.name || null, needs_alias: false };
  }
  if (name) {
    const aliasNorm = normalize(name);
    const { data: byAlias } = await supabase.from("supplier_aliases").select("supplier_id, suppliers(name)").eq("alias_normalized", aliasNorm).maybeSingle();
    if (byAlias) return { supplier_id: byAlias.supplier_id, supplier_name: (byAlias as any).suppliers?.name || null, needs_alias: false };
    // Sem auto-vínculo por similaridade de nome — sempre pedir confirmação do usuário.
    return { supplier_id: null, supplier_name: null, needs_alias: true };
  }
  return { supplier_id: null, supplier_name: null, needs_alias: false };
}

function fmtCurrency(v: number) { return v.toFixed(2).replace(".", ","); }

function buildBatchPreview(items: ResolvedItem[], supplierName: string | null, detectedSupplier: string | null): string {
  const active = items.filter(i => !i.excluded);
  const total = active.reduce((s, i) => s + i.valor_total, 0);
  let msg = supplierName
    ? `🧾 *Nota de ${supplierName}* — ${active.length} itens, R$ ${fmtCurrency(total)}\n\n`
    : detectedSupplier
      ? `🧾 *Nota* (${detectedSupplier}) — ${active.length} itens, R$ ${fmtCurrency(total)}\n\n`
      : `🧾 *Compra* — ${active.length} itens, R$ ${fmtCurrency(total)}\n\n`;
  items.forEach((i, idx) => {
    const n = idx + 1;
    if (i.excluded) {
      msg += `~${n}. ${i.produto}~ ❌ removido\n`;
    } else {
      const tag = i.needs_creation ? "🆕 cadastrar" : (i.product_name ? "✅" : "❓");
      const hidden = i.is_hidden ? " 🙈 oculto" : "";
      const display = i.product_name || i.produto;
      msg += `${n}. ${display}${hidden} — ${i.quantidade} ${i.unidade} — R$ ${fmtCurrency(i.valor_total)} ${tag}\n`;
    }
  });
  msg += `\n*1* - Confirmar tudo\n*2* - Cancelar\n*r N* - Remover item N (ex: r 3)`;
  return msg;
}

async function sendNextNewProductPrompt(
  supabase: ReturnType<typeof getSupabase>, phone: string, pendingId: string, items: ResolvedItem[]
): Promise<boolean> {
  const idx = items.findIndex(i => !i.excluded && i.needs_creation && !i.product_id && !i.creation_confirmed);
  if (idx === -1) return false;
  const it = items[idx];
  // sugerir categoria pelo nome
  const { data: cats } = await supabase.from("product_categories").select("id, name").order("name");
  let suggestedCat: { id: string; name: string } | null = null;
  if (cats?.length) {
    const scored = cats.map(c => ({ ...c, score: scoreProduct(it.produto, c.name) })).sort((a, b) => b.score - a.score);
    if (scored[0].score >= 0.4) suggestedCat = { id: scored[0].id, name: scored[0].name };
  }
  it.suggested_category_id = suggestedCat?.id || null;

  await supabase.from("pending_whatsapp_purchases").update({
    status: "awaiting_new_product_confirm",
    current_item_index: idx,
    items: items as any,
  }).eq("id", pendingId);

  let msg = `🆕 Item ${idx + 1}/${items.length}: *${it.produto}*\n`;
  msg += `Quantidade: ${it.quantidade} ${it.unidade} — R$ ${fmtCurrency(it.valor_total)}\n\n`;
  msg += `Esse produto não está cadastrado. O que fazer?\n\n`;
  msg += `*1* - Cadastrar (categoria: ${suggestedCat?.name || "A definir"}, unid: ${it.unidade})\n`;
  msg += `*2* - Vincular a outro produto (responda o nome)\n`;
  msg += `*3* - Pular este item`;
  await sendWhatsApp(phone, msg);
  return true;
}

async function sendNextAmbiguousPrompt(
  supabase: ReturnType<typeof getSupabase>, phone: string, pendingId: string, items: ResolvedItem[]
): Promise<boolean> {
  const idx = items.findIndex(i => !i.excluded && !i.product_id && !i.needs_creation && i.ambiguous_options?.length);
  if (idx === -1) return false;
  const it = items[idx];
  await supabase.from("pending_whatsapp_purchases").update({
    status: "awaiting_product_choice",
    current_item_index: idx,
    items: items as any,
  }).eq("id", pendingId);
  let msg = `🔍 Item ${idx + 1}/${items.length}: "*${it.produto}*"\n\nMais de um produto parecido. Escolha:\n`;
  it.ambiguous_options!.forEach((o, i) => { msg += `${i + 1} - ${o.name}${o.hidden ? " (oculto das fichas)" : ""}\n`; });
  msg += `*N* - Cadastrar como novo\n*P* - Pular este item`;
  await sendWhatsApp(phone, msg);
  return true;
}

async function advanceFlow(
  supabase: ReturnType<typeof getSupabase>, phone: string, pendingId: string, pending: any
): Promise<void> {
  const items = (pending.items || []) as ResolvedItem[];
  // 1) supplier alias?
  if (pending.detected_supplier_name && !pending.supplier_id) {
    // attempt resolve again (in case user added)
    const r = await resolveSupplier(supabase, pending.detected_supplier_name, pending.detected_supplier_cnpj);
    if (r.supplier_id) {
      await supabase.from("pending_whatsapp_purchases").update({ supplier_id: r.supplier_id }).eq("id", pendingId);
      pending.supplier_id = r.supplier_id;
    } else {
      await supabase.from("pending_whatsapp_purchases").update({ status: "awaiting_supplier_alias" }).eq("id", pendingId);
      const { data: suppliers } = await supabase.from("suppliers").select("id, name, is_active").order("is_active", { ascending: false }).order("name");
      let msg = `🏪 *Fornecedor da nota:* ${pending.detected_supplier_name}`;
      if (pending.detected_supplier_cnpj) msg += ` (CNPJ ${pending.detected_supplier_cnpj})`;
      msg += `\n\nEsse nome não está cadastrado. A qual fornecedor corresponde?\n\n`;
      (suppliers || []).forEach((s, i) => { msg += `${i + 1} - ${s.name}${s.is_active ? "" : " (inativo)"}\n`; });
      msg += `*N* - Cadastrar como novo fornecedor\n*P* - Sem fornecedor`;
      await sendWhatsApp(phone, msg);
      return;
    }
  }
  if (!pending.supplier_id && !pending.detected_supplier_name) {
    // no supplier at all — ask
    await supabase.from("pending_whatsapp_purchases").update({ status: "awaiting_supplier" }).eq("id", pendingId);
    const { data: suppliers } = await supabase.from("suppliers").select("id, name, is_active").order("is_active", { ascending: false }).order("name");
    let msg = `🏪 *Escolha o fornecedor:*\n`;
    (suppliers || []).forEach((s, i) => { msg += `${i + 1} - ${s.name}${s.is_active ? "" : " (inativo)"}\n`; });
    msg += `*N* - Cadastrar novo fornecedor\n*P* - Sem fornecedor`;
    await sendWhatsApp(phone, msg);
    return;
  }
  // 2) ambiguous items
  if (await sendNextAmbiguousPrompt(supabase, phone, pendingId, items)) return;
  // 3) new product items
  if (await sendNextNewProductPrompt(supabase, phone, pendingId, items)) return;
  // 4) batch confirm
  await supabase.from("pending_whatsapp_purchases").update({
    status: "awaiting_batch_confirm",
    items: items as any,
  }).eq("id", pendingId);
  const { data: sup } = await supabase.from("suppliers").select("name").eq("id", pending.supplier_id).maybeSingle();
  await sendWhatsApp(phone, buildBatchPreview(items, sup?.name || null, pending.detected_supplier_name));
}

async function commitBatch(
  supabase: ReturnType<typeof getSupabase>, phone: string, pending: any
): Promise<void> {
  const items: ResolvedItem[] = (pending.items || []).filter((i: ResolvedItem) => !i.excluded);
  if (items.length === 0) {
    await supabase.from("pending_whatsapp_purchases").delete().eq("id", pending.id);
    await sendWhatsApp(phone, "❌ Nenhum item para registrar. Compra cancelada.");
    return;
  }
  let inserted = 0;
  let failed = 0;
  for (const it of items) {
    let productId = it.product_id;
    if (!productId && it.needs_creation) {
      const { data: newProd, error: pErr } = await supabase.from("products").insert({
        name: it.produto,
        unit: it.unidade,
        category_id: it.suggested_category_id || null,
        is_active: true,
      }).select("id").single();
      if (pErr || !newProd) { console.error("create product failed", pErr); failed++; continue; }
      productId = newProd.id;
    }
    if (!productId) { failed++; continue; }
    const { error: insErr } = await supabase.from("purchase_history").insert({
      product_id: productId,
      quantity: it.quantidade,
      total_price: it.valor_total,
      supplier_id: pending.supplier_id,
      purchase_date: new Date().toISOString().split("T")[0],
      notes: `Via WhatsApp: ${pending.message_original?.substring(0, 200) || ""}`,
    });
    if (insErr) { console.error("insert purchase failed", insErr); failed++; }
    else inserted++;
  }
  await supabase.from("pending_whatsapp_purchases").delete().eq("id", pending.id);
  const total = items.reduce((s, i) => s + i.valor_total, 0);
  let msg = `✅ *${inserted} compras registradas!*\n💰 Total: R$ ${fmtCurrency(total)}`;
  if (failed > 0) msg += `\n⚠️ ${failed} item(ns) falharam.`;
  msg += `\n_Estoque atualizado automaticamente._`;
  await sendWhatsApp(phone, msg);
}

// --- Pending state handlers (multi-item) ---

async function handlePending(
  supabase: ReturnType<typeof getSupabase>, phone: string, messageText: string, pending: any
): Promise<void> {
  const text = messageText.trim();
  const lower = normalize(text);
  const items = (pending.items || []) as ResolvedItem[];
  const idx = pending.current_item_index ?? 0;

  // remove command from batch confirm
  if (pending.status === "awaiting_batch_confirm") {
    if (lower === "1" || lower === "sim" || lower === "s") {
      const active = items.filter(i => !i.excluded);
      const hidden = active.filter(i => i.is_hidden && !i.release_decided);
      if (hidden.length > 0) {
        let msg = `⚠️ *Atenção:* ${hidden.length === 1 ? 'o produto abaixo existe' : 'os produtos abaixo existem'} no estoque mas ${hidden.length === 1 ? 'está oculto' : 'estão ocultos'} das fichas técnicas (não fazem parte de nenhuma receita):\n\n`;
        hidden.forEach((h, i) => { msg += `${i + 1}. ${h.product_name || h.produto}\n`; });
        msg += `\n*S* - Liberar ${hidden.length === 1 ? 'esse produto' : 'todos'} para uso nas fichas técnicas\n*N* - Manter ${hidden.length === 1 ? 'oculto' : 'todos ocultos'} e registrar a compra mesmo assim`;
        await supabase.from("pending_whatsapp_purchases").update({ status: "awaiting_visibility_release", items: items as any }).eq("id", pending.id);
        await sendWhatsApp(phone, msg);
        return;
      }
      await commitBatch(supabase, phone, pending);
      return;
    }
    if (lower === "2" || lower === "nao" || lower === "não" || lower === "n") {
      await supabase.from("pending_whatsapp_purchases").delete().eq("id", pending.id);
      await sendWhatsApp(phone, "❌ Compra cancelada.");
      return;
    }
    const rm = lower.match(/^r\s*(\d+)$/);
    if (rm) {
      const n = parseInt(rm[1], 10) - 1;
      if (n >= 0 && n < items.length) {
        items[n].excluded = true;
        await supabase.from("pending_whatsapp_purchases").update({ items: items as any }).eq("id", pending.id);
        const { data: sup } = await supabase.from("suppliers").select("name").eq("id", pending.supplier_id).maybeSingle();
        await sendWhatsApp(phone, buildBatchPreview(items, sup?.name || null, pending.detected_supplier_name));
      } else {
        await sendWhatsApp(phone, `❌ Item ${rm[1]} não existe.`);
      }
      return;
    }
    await sendWhatsApp(phone, "🔄 Responda *1* (confirmar), *2* (cancelar) ou *r N* (remover item N).");
    return;
  }

  if (pending.status === "awaiting_visibility_release") {
    const active = items.filter(i => !i.excluded);
    const hidden = active.filter(i => i.is_hidden && !i.release_decided);
    if (lower === "s" || lower === "1" || lower === "sim") {
      for (const h of hidden) {
        if (h.product_id) {
          await supabase.from("products").update({ is_visible_in_recipes: true }).eq("id", h.product_id);
        }
        h.release_decided = true;
        h.is_hidden = false;
      }
      await supabase.from("pending_whatsapp_purchases").update({ items: items as any }).eq("id", pending.id);
      await sendWhatsApp(phone, `✅ ${hidden.length === 1 ? 'Produto liberado' : 'Produtos liberados'} para uso nas fichas técnicas.`);
      await commitBatch(supabase, phone, pending);
      return;
    }
    if (lower === "n" || lower === "2" || lower === "nao" || lower === "não") {
      for (const h of hidden) { h.release_decided = true; }
      await supabase.from("pending_whatsapp_purchases").update({ items: items as any }).eq("id", pending.id);
      await commitBatch(supabase, phone, pending);
      return;
    }
    await sendWhatsApp(phone, "🔄 Responda *S* (liberar) ou *N* (manter oculto).");
    return;
  }


  if (pending.status === "awaiting_new_supplier_name") {
    const newName = text.trim();
    if (newName.length < 2) { await sendWhatsApp(phone, "❌ Nome muito curto. Envie o nome do novo fornecedor."); return; }
    const { data: newSup, error } = await supabase.from("suppliers").insert({
      name: newName,
      is_active: true,
    }).select("id, name").single();
    if (error || !newSup) {
      await sendWhatsApp(phone, "❌ Erro ao cadastrar fornecedor. Tente outro nome.");
      return;
    }
    pending.supplier_id = newSup.id;
    await supabase.from("pending_whatsapp_purchases").update({ supplier_id: newSup.id, status: "awaiting_supplier" }).eq("id", pending.id);
    await sendWhatsApp(phone, `✅ Fornecedor *${newSup.name}* cadastrado.`);
    await advanceFlow(supabase, phone, pending.id, pending);
    return;
  }

  if (pending.status === "awaiting_supplier_alias" || pending.status === "awaiting_supplier") {
    const { data: suppliers } = await supabase.from("suppliers").select("id, name, is_active").order("is_active", { ascending: false }).order("name");
    const sList = suppliers || [];
    if (lower === "p") {
      // proceed without supplier
      pending.supplier_id = null;
      await supabase.from("pending_whatsapp_purchases").update({ supplier_id: null, detected_supplier_name: null }).eq("id", pending.id);
      pending.detected_supplier_name = null;
      await advanceFlow(supabase, phone, pending.id, pending);
      return;
    }
    if (lower === "n") {
      if (pending.detected_supplier_name) {
        const { data: newSup, error } = await supabase.from("suppliers").insert({
          name: pending.detected_supplier_name,
          cnpj: pending.detected_supplier_cnpj,
          is_active: true,
        }).select("id, name").single();
        if (error || !newSup) {
          await sendWhatsApp(phone, "❌ Erro ao cadastrar fornecedor. Escolha um da lista.");
          return;
        }
        pending.supplier_id = newSup.id;
        await supabase.from("pending_whatsapp_purchases").update({ supplier_id: newSup.id }).eq("id", pending.id);
        await advanceFlow(supabase, phone, pending.id, pending);
      } else {
        await supabase.from("pending_whatsapp_purchases").update({ status: "awaiting_new_supplier_name" }).eq("id", pending.id);
        await sendWhatsApp(phone, "✍️ Envie o *nome* do novo fornecedor:");
      }
      return;
    }
    const num = parseInt(text, 10);
    let chosen: { id: string; name: string; is_active?: boolean } | null = null;
    if (!isNaN(num) && num >= 1 && num <= sList.length) chosen = sList[num - 1];
    else {
      const scored = sList.map(s => ({ ...s, score: scoreProduct(text, s.name) })).filter(s => s.score >= 0.5).sort((a, b) => b.score - a.score);
      if (scored.length === 1 || (scored.length > 1 && scored[0].score - scored[1].score >= 0.15)) chosen = scored[0];
    }
    if (!chosen) { await sendWhatsApp(phone, "❌ Não identifiquei. Responda com o número da lista, *N* (novo) ou *P* (sem)."); return; }
    pending.supplier_id = chosen.id;
    // Reativar fornecedor inativo escolhido
    if (chosen.is_active === false) {
      await supabase.from("suppliers").update({ is_active: true }).eq("id", chosen.id);
    }
    // se veio de mídia com nome detectado, gravar alias
    if (pending.detected_supplier_name) {
      const aliasNorm = normalize(pending.detected_supplier_name);
      await supabase.from("supplier_aliases").upsert({
        supplier_id: chosen.id,
        alias: pending.detected_supplier_name,
        alias_normalized: aliasNorm,
        cnpj: pending.detected_supplier_cnpj,
      }, { onConflict: "alias_normalized" });
    }
    await supabase.from("pending_whatsapp_purchases").update({ supplier_id: chosen.id }).eq("id", pending.id);
    await advanceFlow(supabase, phone, pending.id, pending);
    return;
  }

  if (pending.status === "awaiting_product_choice") {
    const it = items[idx];
    if (!it?.ambiguous_options?.length) { await advanceFlow(supabase, phone, pending.id, pending); return; }
    if (lower === "p") {
      it.excluded = true;
      await supabase.from("pending_whatsapp_purchases").update({ items: items as any }).eq("id", pending.id);
      await advanceFlow(supabase, phone, pending.id, pending);
      return;
    }
    if (lower === "n") {
      it.needs_creation = true;
      it.ambiguous_options = undefined;
      await supabase.from("pending_whatsapp_purchases").update({ items: items as any }).eq("id", pending.id);
      await advanceFlow(supabase, phone, pending.id, pending);
      return;
    }
    const num = parseInt(text, 10);
    let chosen = null;
    if (!isNaN(num) && num >= 1 && num <= it.ambiguous_options.length) chosen = it.ambiguous_options[num - 1];
    else {
      const sc = it.ambiguous_options.map(o => ({ ...o, score: scoreProduct(text, o.name) })).filter(o => o.score >= 0.5).sort((a, b) => b.score - a.score);
      if (sc.length === 1 || (sc.length > 1 && sc[0].score - sc[1].score >= 0.15)) chosen = sc[0];
    }
    if (!chosen) { await sendWhatsApp(phone, "❌ Não identifiquei. Responda com o número, *N* (novo) ou *P* (pular)."); return; }
    it.product_id = chosen.id;
    it.product_name = chosen.name;
    it.ambiguous_options = undefined;
    await supabase.from("pending_whatsapp_purchases").update({ items: items as any }).eq("id", pending.id);
    await advanceFlow(supabase, phone, pending.id, pending);
    return;
  }

  if (pending.status === "awaiting_new_product_confirm") {
    const it = items[idx];
    if (!it) { await advanceFlow(supabase, phone, pending.id, pending); return; }
    if (lower === "1") {
      // Confirma criação no commit final; marca para não repetir o prompt
      it.needs_creation = true;
      it.creation_confirmed = true;
      it.product_name = it.produto;
      await supabase.from("pending_whatsapp_purchases").update({ items: items as any }).eq("id", pending.id);
      await advanceFlow(supabase, phone, pending.id, pending);
      return;
    }
    if (lower === "3" || lower === "p") {
      it.excluded = true;
      await supabase.from("pending_whatsapp_purchases").update({ items: items as any }).eq("id", pending.id);
      await advanceFlow(supabase, phone, pending.id, pending);
      return;
    }
    if (lower === "2") {
      await sendWhatsApp(phone, "📝 Digite o nome do produto cadastrado para vincular:");
      // mantém status, próxima mensagem será tratada como nome livre
      return;
    }
    // tratar texto livre como busca
    const { data: products } = await supabase.from("products").select("id, name, unit").eq("is_active", true);
    const scored = (products || []).map(p => ({ ...p, score: scoreProduct(text, p.name) })).filter(s => s.score >= 0.5).sort((a, b) => b.score - a.score);
    if (scored.length === 0) { await sendWhatsApp(phone, "❌ Não achei. Tente outro nome, ou responda *1* (cadastrar) ou *3* (pular)."); return; }
    if (scored.length > 1 && scored[0].score - scored[1].score < 0.15) {
      let msg = `🔍 Vários produtos parecidos:\n`;
      scored.slice(0, 4).forEach((s, i) => { msg += `${i + 1} - ${s.name}\n`; });
      msg += `\nResponda o número exato.`;
      it.ambiguous_options = scored.slice(0, 4).map(s => ({ id: s.id, name: s.name }));
      it.needs_creation = false;
      await supabase.from("pending_whatsapp_purchases").update({
        items: items as any, status: "awaiting_product_choice",
      }).eq("id", pending.id);
      await sendWhatsApp(phone, msg);
      return;
    }
    it.product_id = scored[0].id;
    it.product_name = scored[0].name;
    it.needs_creation = false;
    await supabase.from("pending_whatsapp_purchases").update({ items: items as any }).eq("id", pending.id);
    await advanceFlow(supabase, phone, pending.id, pending);
    return;
  }
}

// --- Main handler ---

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    console.log("Webhook:", JSON.stringify(body).substring(0, 500));
    if (body.fromMe || body.isGroup || body.isStatusReply) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const phone = body.phone || body.from || "";
    const messageText = body.text?.message || body.message?.text || body.text || "";
    const imageUrl = body.image?.imageUrl || body.imageUrl || null;
    const imageCaption = body.image?.caption || body.caption || "";
    const docUrl = body.document?.documentUrl || body.document?.url || null;
    const docMime = body.document?.mimeType || body.document?.mime_type || null;
    const docCaption = body.document?.caption || "";
    if (!phone) return new Response(JSON.stringify({ ok: true, no_phone: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = getSupabase();

    // Pending interactions take priority for text
    if (messageText && !imageUrl && !docUrl) {
      const { data: pendingList } = await supabase
        .from("pending_whatsapp_purchases").select("*").eq("phone", phone)
        .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1);
      if (pendingList?.length) {
        await handlePending(supabase, phone, messageText, pendingList[0]);
        return new Response(JSON.stringify({ ok: true, handled_pending: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Determine media
    let mediaUrl: string | null = null;
    let mediaMime: string | null = null;
    let mediaCaption = "";
    if (imageUrl) { mediaUrl = imageUrl; mediaMime = "image/jpeg"; mediaCaption = imageCaption; }
    else if (docUrl) { mediaUrl = docUrl; mediaMime = docMime || "application/pdf"; mediaCaption = docCaption; }

    let parsed: ParsedBatch | null = null;
    let originalMessage = messageText;

    if (mediaUrl) {
      const isPdf = mediaMime === "application/pdf";
      await sendWhatsApp(phone, isPdf ? "📄 *Lendo PDF da nota...* Pode levar até 1 minuto." : "📸 *Analisando imagem...* Aguarde.");
      const dl = await downloadAsBase64(mediaUrl);
      if (!dl) {
        await sendWhatsApp(phone, "❌ Não consegui baixar a mídia. Tente reenviar.");
        return new Response(JSON.stringify({ ok: true, download_failed: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const effectiveMime = isPdf ? "application/pdf" : (dl.mimeType.startsWith("image/") ? dl.mimeType : "image/jpeg");
      parsed = await parseMediaWithAI(dl.base64, effectiveMime, mediaCaption || undefined);
      if (!parsed) {
        await sendWhatsApp(phone, "❌ Não consegui identificar itens de compra na mídia.\n\nTente foto mais nítida, ou digite os itens.");
        return new Response(JSON.stringify({ ok: true, media_not_parsed: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      originalMessage = `[${isPdf ? "PDF" : "FOTO"}] ${mediaCaption || `${parsed.itens.length} itens`}`;
    } else if (messageText) {
      parsed = await parseTextWithAI(messageText);
      if (!parsed) {
        await sendWhatsApp(phone, "❌ Não consegui identificar dados de compra.\n\nExemplos:\n_10kg arroz 60 reais_\n_2cx cerveja 80 + 5kg açúcar 25_\n\n📸 Você também pode enviar foto/PDF da nota fiscal!");
        return new Response(JSON.stringify({ ok: true, not_purchase: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else {
      return new Response(JSON.stringify({ ok: true, no_content: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log("Parsed batch:", parsed.itens.length, "items, supplier:", parsed.fornecedor_nome);

    // Resolve items + supplier
    const items = await resolveItems(supabase, parsed.itens);
    const supRes = await resolveSupplier(supabase, parsed.fornecedor_nome, parsed.fornecedor_cnpj);

    // Clean old pendings for this phone
    await supabase.from("pending_whatsapp_purchases").delete().eq("phone", phone);

    // Insert pending batch — use first item's data for legacy NOT NULL columns? we made them nullable.
    const { data: pending, error: pErr } = await supabase.from("pending_whatsapp_purchases").insert({
      phone,
      message_original: originalMessage,
      source_type: mediaUrl ? (mediaMime === "application/pdf" ? "pdf" : "image") : "text",
      items: items as any,
      detected_supplier_name: parsed.fornecedor_nome,
      detected_supplier_cnpj: parsed.fornecedor_cnpj,
      supplier_id: supRes.supplier_id,
      status: "processing",
      product_id: items[0]?.product_id || null,
      quantity: items[0]?.quantidade || null,
      unit: items[0]?.unidade || null,
      total_price: items[0]?.valor_total || null,
    }).select("*").single();
    if (pErr || !pending) {
      console.error("pending insert failed", pErr);
      await sendWhatsApp(phone, "❌ Erro interno ao processar compra.");
      return new Response(JSON.stringify({ ok: false, error: "pending_insert" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await advanceFlow(supabase, phone, pending.id, pending);
    return new Response(JSON.stringify({ ok: true, items: items.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
