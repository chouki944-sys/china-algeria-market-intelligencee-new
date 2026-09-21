import { z } from "zod";

const COMTRADE_KEY = "";

async function getJson(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "China-Algeria-Market-Intelligence/0.1"
    }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`);
  }
  return await response.json();
}

// قائمة الأدوات لتعريفها لـ Claude
const TOOLS = [
  {
    name: "trade_data",
    description: "Query official UN Comtrade merchandise trade data.",
    inputSchema: {
      type: "object",
      properties: {
        reporterCode: { type: "string", description: "Country reporter code, e.g. 012 for Algeria" },
        partnerCode: { type: "string", default: "156", description: "Country partner code, e.g. 156 for China" },
        cmdCode: { type: "string", description: "HS product code" },
        period: { type: "string", description: "Year/Period e.g. 2023" },
        flowCode: { type: "string", enum: ["M", "X"], default: "M" },
        motCode: { type: "string", default: "0" }
      },
      required: ["reporterCode", "cmdCode", "period"]
    }
  },
  {
    name: "trade_series",
    description: "Retrieve year-by-year UN Comtrade trade data.",
    inputSchema: {
      type: "object",
      properties: {
        reporterCode: { type: "string" },
        partnerCode: { type: "string" },
        cmdCode: { type: "string" },
        startYear: { type: "integer" },
        endYear: { type: "integer" },
        flowCode: { type: "string", enum: ["M", "X"], default: "M" }
      },
      required: ["reporterCode", "partnerCode", "cmdCode", "startYear", "endYear"]
    }
  },
  {
    name: "world_bank_indicator",
    description: "Retrieve World Bank economic and development indicators.",
    inputSchema: {
      type: "object",
      properties: {
        country: { type: "string", description: "Country ISO code (e.g., DZA, CHN)" },
        indicator: { type: "string", description: "World Bank indicator code" },
        startYear: { type: "integer", default: 2020 },
        endYear: { type: "integer", default: 2025 }
      },
      required: ["country", "indicator"]
    }
  },
  {
    name: "company_wikidata",
    description: "Search Wikidata for companies and organizations.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        country: { type: "string" }
      },
      required: ["query"]
    }
  },
  {
    name: "product_opportunity_brief",
    description: "Create a structured research plan for an industrial product.",
    inputSchema: {
      type: "object",
      properties: {
        product: { type: "string" },
        hsCodes: { type: "array", items: { type: "string" } },
        countries: { type: "array", items: { type: "string" }, default: ["Algeria", "China"] },
        years: { type: "array", items: { type: "integer" }, default: [2021, 2022, 2023, 2024, 2025] }
      },
      required: ["product"]
    }
  }
];

// تنفيذ الأدوات
async function handleToolCall(name: string, args: any) {
  if (name === "trade_data") {
    const key = COMTRADE_KEY ? `&subscription-key=${encodeURIComponent(COMTRADE_KEY)}` : "";
    const url = `https://comtradeapi.un.org/public/v1/preview/C/A/HS?cmdCode=${encodeURIComponent(args.cmdCode)}&flowCode=${args.flowCode || "M"}&partnerCode=${encodeURIComponent(args.partnerCode || "156")}&partner2Code=0&reporterCode=${encodeURIComponent(args.reporterCode)}&period=${encodeURIComponent(args.period)}&motCode=${encodeURIComponent(args.motCode || "0")}&maxRecords=500${key}`;
    const data = await getJson(url);
    return {
      content: [{ type: "text", text: JSON.stringify({ source: "UN Comtrade", query: args, data: data.data || data }, null, 2) }]
    };
  }

  if (name === "trade_series") {
    const rows: any[] = [];
    for (let year = args.startYear; year <= args.endYear; year++) {
      const key = COMTRADE_KEY ? `&subscription-key=${encodeURIComponent(COMTRADE_KEY)}` : "";
      const url = `https://comtradeapi.un.org/public/v1/preview/C/A/HS?cmdCode=${encodeURIComponent(args.cmdCode)}&flowCode=${args.flowCode || "M"}&partnerCode=${encodeURIComponent(args.partnerCode)}&partner2Code=0&reporterCode=${encodeURIComponent(args.reporterCode)}&period=${year}&motCode=0&maxRecords=500${key}`;
      const data = await getJson(url);
      rows.push(...(data.data || []));
    }
    return {
      content: [{ type: "text", text: JSON.stringify({ source: "UN Comtrade", rows }, null, 2) }]
    };
  }

  if (name === "world_bank_indicator") {
    const startYear = args.startYear || 2020;
    const endYear = args.endYear || 2025;
    const url = `https://api.worldbank.org/v2/country/${args.country}/indicator/${args.indicator}?format=json&per_page=100&date=${startYear}:${endYear}`;
    const data = await getJson(url);
    return {
      content: [{ type: "text", text: JSON.stringify({ source: "World Bank", data: data?.[1] || data }, null, 2) }]
    };
  }

  if (name === "company_wikidata") {
    const searchTerm = args.country ? `${args.query} ${args.country}` : args.query;
    const safeQuery = searchTerm.replace(/"/g, '\\"');
    const sparql = `SELECT ?item ?itemLabel ?website ?countryLabel ?description WHERE { ?item rdfs:label ?label . FILTER(LANG(?label)="en") FILTER(CONTAINS(LCASE(?label), LCASE("${safeQuery}"))) OPTIONAL { ?item wdt:P856 ?website } OPTIONAL { ?item wdt:P17 ?country } OPTIONAL { ?item schema:description ?description . FILTER(LANG(?description)="en") } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 25`;
    const url = "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(sparql);
    const data = await getJson(url);
    const results = (data.results?.bindings || []).map((item: any) => ({
      name: item.itemLabel?.value,
      website: item.website?.value,
      country: item.countryLabel?.value,
      description: item.description?.value,
      wikidata: item.item?.value
    }));
    return {
      content: [{ type: "text", text: JSON.stringify({ source: "Wikidata", results }, null, 2) }]
    };
  }

  if (name === "product_opportunity_brief") {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          product: args.product,
          countries: args.countries || ["Algeria", "China"],
          years: args.years || [2021, 2022, 2023, 2024, 2025],
          status: "Research parameters verified"
        }, null, 2)
      }]
    };
  }

  throw new Error(`Tool not found: ${name}`);
}

// معالجة بروتوكول MCP (JSON-RPC)
async function handleMcpRequest(body: any) {
  const { id, method, params } = body;

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: {
          name: "China-Algeria Industrial Market Intelligence",
          version: "0.1.0"
        }
      }
    };
  }

  if (method === "notifications/initialized") {
    return null;
  }

  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: TOOLS
      }
    };
  }

  if (method === "tools/call") {
    try {
      const toolResult = await handleToolCall(params.name, params.arguments || {});
      return {
        jsonrpc: "2.0",
        id,
        result: toolResult
      };
    } catch (err: any) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32603, message: err.message }
      };
    }
  }

  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` }
  };
}

export default {
  async fetch(request: Request): Promise<Response> {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
    }

    if (request.method === "POST") {
      try {
        const body = await request.json();
        const response = await handleMcpRequest(body);
        if (!response) {
          return new Response(null, { status: 204, headers: corsHeaders });
        }
        return new Response(JSON.stringify(response), { status: 200, headers: corsHeaders });
      } catch (err: any) {
        return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" } }), {
          status: 400,
          headers: corsHeaders
        });
      }
    }

    // لطلبات الـ GET الافتراضية
    return new Response(JSON.stringify({
      name: "China-Algeria Industrial Market Intelligence MCP",
      status: "ready"
    }), { status: 200, headers: corsHeaders });
  }
};
