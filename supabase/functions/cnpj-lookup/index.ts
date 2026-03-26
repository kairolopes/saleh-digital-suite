import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cnpj } = await req.json();
    if (!cnpj) {
      return new Response(JSON.stringify({ error: "CNPJ é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Remove formatting
    const cleanCnpj = cnpj.replace(/\D/g, "");
    if (cleanCnpj.length !== 14) {
      return new Response(JSON.stringify({ error: "CNPJ deve ter 14 dígitos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Query BrasilAPI
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return new Response(JSON.stringify({ error: "CNPJ não encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("BrasilAPI error:", response.status, errText);
      return new Response(JSON.stringify({ error: "Erro ao consultar CNPJ" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();

    // Map to our supplier fields
    const parts = [data.descricao_tipo_de_logradouro, data.logradouro, data.numero, data.complemento, data.bairro, data.municipio, data.uf]
      .filter(Boolean);
    const address = parts.join(", ");

    const result = {
      name: data.nome_fantasia || data.razao_social || "",
      razao_social: data.razao_social || "",
      nome_fantasia: data.nome_fantasia || "",
      phone: data.ddd_telefone_1 ? `(${data.ddd_telefone_1.substring(0, 2)}) ${data.ddd_telefone_1.substring(2)}` : "",
      email: data.email || "",
      address,
      cnpj: cleanCnpj,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("CNPJ lookup error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
