import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
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

function createServer() {
  const server = new McpServer({
    name: "China-Algeria Industrial Market Intelligence",
    version: "0.1.0"
  });

  // 1. UN COMTRADE
  server.registerTool(
    "trade_data",
    {
      title: "UN Comtrade trade data",
      description: "Query official UN Comtrade merchandise trade data.",
      inputSchema: {
        reporterCode: z.string(),
        partnerCode: z.string().default("156"),
        cmdCode: z.string(),
        period: z.string(),
        flowCode: z.enum(["M", "X"]).default("M"),
        motCode: z.string().default("0")
      }
    },
    async ({ reporterCode, partnerCode, cmdCode, period, flowCode, motCode }) => {
      const key = COMTRADE_KEY
        ? `&subscription-key=${encodeURIComponent(COMTRADE_KEY)}`
        : "";

      const url =
        `https://comtradeapi.un.org/public/v1/preview/C/A/HS` +
        `?cmdCode=${encodeURIComponent(cmdCode)}` +
        `&flowCode=${flowCode}` +
        `&partnerCode=${encodeURIComponent(partnerCode)}` +
        `&partner2Code=0` +
        `&reporterCode=${encodeURIComponent(reporterCode)}` +
        `&period=${encodeURIComponent(period)}` +
        `&motCode=${encodeURIComponent(motCode)}` +
        `&maxRecords=500${key}`;

      const data = await getJson(url);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                source: "UN Comtrade",
                query: {
                  reporterCode,
                  partnerCode,
                  cmdCode,
                  period,
                  flowCode
                },
                data: data.data || data
              },
              null,
              2
            )
          }
        ]
      };
    }
  );

  // 2. MULTI-YEAR TRADE
  server.registerTool(
    "trade_series",
    {
      title: "UN Comtrade multi-year series",
      description: "Retrieve year-by-year trade data.",
      inputSchema: {
        reporterCode: z.string(),
        partnerCode: z.string(),
        cmdCode: z.string(),
        startYear: z.number().int(),
        endYear: z.number().int(),
        flowCode: z.enum(["M", "X"]).default("M")
      }
    },
    async ({ reporterCode, partnerCode, cmdCode, startYear, endYear, flowCode }) => {
      const rows: any[] = [];

      for (let year = startYear; year <= endYear; year++) {
        const key = COMTRADE_KEY
          ? `&subscription-key=${encodeURIComponent(COMTRADE_KEY)}`
          : "";

        const url =
          `https://comtradeapi.un.org/public/v1/preview/C/A/HS` +
          `?cmdCode=${encodeURIComponent(cmdCode)}` +
          `&flowCode=${flowCode}` +
          `&partnerCode=${encodeURIComponent(partnerCode)}` +
          `&partner2Code=0` +
          `&reporterCode=${encodeURIComponent(reporterCode)}` +
          `&period=${year}` +
          `&motCode=0` +
          `&maxRecords=500${key}`;

        const data = await getJson(url);
        rows.push(...(data.data || []));
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                source: "UN Comtrade",
                reporterCode,
                partnerCode,
                cmdCode,
                startYear,
                endYear,
                flowCode,
                rows
              },
              null,
              2
            )
          }
        ]
      };
    }
  );

  // 3. WORLD BANK
  server.registerTool(
    "world_bank_indicator",
    {
      title: "World Bank indicator",
      description: "Retrieve World Bank economic and development indicators.",
      inputSchema: {
        country: z.string(),
        indicator: z.string(),
        startYear: z.number().int().default(2020),
        endYear: z.number().int().default(2025)
      }
    },
    async ({ country, indicator, startYear, endYear }) => {
      const url =
        `https://api.worldbank.org/v2/country/${country}` +
        `/indicator/${indicator}` +
        `?format=json&per_page=100&date=${startYear}:${endYear}`;

      const data = await getJson(url);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                source: "World Bank",
                country,
                indicator,
                data: data?.[1] || data
              },
              null,
              2
            )
          }
        ]
      };
    }
  );

  // 4. COMPANY SEARCH — WIKIDATA
  server.registerTool(
    "company_wikidata",
    {
      title: "Company / organization lookup",
      description: "Search Wikidata for companies and organizations.",
      inputSchema: {
        query: z.string(),
        country: z.string().optional()
      }
    },
    async ({ query, country }) => {
      const searchTerm = country ? `${query} ${country}` : query;
      const safeQuery = searchTerm.replace(/"/g, '\\"');

      const sparql = `
SELECT ?item ?itemLabel ?website ?countryLabel ?description WHERE {
  ?item rdfs:label ?label .
  FILTER(LANG(?label)="en")
  FILTER(CONTAINS(LCASE(?label), LCASE("${safeQuery}")))

  OPTIONAL {
    ?item wdt:P856 ?website
  }

  OPTIONAL {
    ?item wdt:P17 ?country
  }

  OPTIONAL {
    ?item schema:description ?description .
    FILTER(LANG(?description)="en")
  }

  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en".
  }
}
LIMIT 25
`;

      const url =
        "https://query.wikidata.org/sparql?format=json&query=" +
        encodeURIComponent(sparql);

      const data = await getJson(url);

      const results = (data.results?.bindings || []).map((item: any) => ({
        name: item.itemLabel?.value,
        website: item.website?.value,
        country: item.countryLabel?.value,
        description: item.description?.value,
        wikidata: item.item?.value
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                source: "Wikidata",
                query: searchTerm,
                results
              },
              null,
              2
            )
          }
        ]
      };
    }
  );

  // 5. PRODUCT OPPORTUNITY
  server.registerTool(
    "product_opportunity_brief",
    {
      title: "Industrial product opportunity brief",
      description: "Create a structured research plan for an industrial product.",
      inputSchema: {
        product: z.string(),
        hsCodes: z.array(z.string()).optional(),
        countries: z.array(z.string()).default(["Algeria", "China"]),
        years: z.array(z.number().int()).default([2021, 2022, 2023, 2024, 2025])
      }
    },
    async ({ product, hsCodes, countries, years }) => {
      const brief = {
        product,
        hsCodes,
        countries,
        years,
        requiredEvidence: [
          "UN Comtrade import/export value and quantity",
          "Top supplier countries",
          "China market share",
          "Year-by-year trade trend",
          "Unit value where possible",
          "Chinese manufacturers",
          "Algerian importers and distributors",
          "Local Algerian manufacturers",
          "Published prices",
          "Technical specifications",
          "Applicable standards",
          "Machinery required for local manufacturing",
          "Raw material requirements",
          "Customs and regulatory constraints",
          "Evidence of demand",
          "Tenders and industrial projects"
        ],
        qualityRules: [
          "Separate observed facts from estimates",
          "Cite every external claim",
          "Do not treat one marketplace listing as market size",
          "Do not infer total demand from one seller",
          "Flag missing data",
          "Flag stale data",
          "Use primary sources whenever possible"
        ]
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(brief, null, 2)
          }
        ]
      };
    }
  );

  return server;
}

// --------------------------------------------------
// CLOUDFLARE WORKER
// --------------------------------------------------

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // التعامل مع فحص المتصفح وطلبات الـ CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-session-id"
        }
      });
    }

    // Health check
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          ok: true,
          name: "China-Algeria Industrial Market Intelligence",
          version: "0.1.0"
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }

    // دعم مسار /mcp ومسار الجذر / معاً لضمان نجاح الفحص
    if (url.pathname === "/mcp" || url.pathname === "/" || url.pathname === "/sse") {
      try {
        const server = createServer();
        const transport = new SSEServerTransport("/messages", new Response().body as any);
        await server.connect(transport);
        
        const response = await (transport as any).start(request);
        const headers = new Headers(response.headers);
        headers.set("Access-Control-Allow-Origin", "*");
        
        return new Response(response.body, {
          status: response.status,
          headers
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
    }

    if (url.pathname === "/messages" && request.method === "POST") {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    return new Response(JSON.stringify({ status: "MCP Server Running" }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
};

 
