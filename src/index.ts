Enterimport { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import http from 'node:http';

const PORT = Number(process.env.PORT || 3000);
const COMTRADE_KEY = process.env.COMTRADE_API_KEY || '';

const server = new McpServer({
  name: 'China-Algeria Industrial Market Intelligence',
  version: '0.1.0',
});

async function getJson(url: string) {
  const r = await fetch(url, {headers:{'User-Agent':'China-Algeria-Market-Intelligence/0.1'}});
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
  return await r.json();
}

server.registerTool('trade_data', {
  title: 'UN Comtrade trade data',
  description: 'Query official UN Comtrade merchandise trade data. Use ISO numeric reporter/partner codes and HS code. Free API key optional but recommended.',
  inputSchema: {
    reporterCode: z.string().describe('UN M49 numeric reporter code, e.g. 12 Algeria, 156 China'),
    partnerCode: z.string().default('156').describe('UN M49 numeric partner code, e.g. 156 China, 0 World'),
    cmdCode: z.string().describe('HS code, e.g. 7308, 7318, 8415'),
    period: z.string().describe('Year, e.g. 2025'),
    flowCode: z.enum(['M','X']).default('M').describe('M imports, X exports'),
    motCode: z.string().default('0'),
  }
}, async ({reporterCode, partnerCode, cmdCode, period, flowCode, motCode}) => {
  const key = COMTRADE_KEY ? `&subscription-key=${encodeURIComponent(COMTRADE_KEY)}` : '';
  const url = `https://comtradeapi.un.org/public/v1/preview/C/A/HS?cmdCode=${encodeURIComponent(cmdCode)}&flowCode=${flowCode}&partnerCode=${encodeURIComponent(partnerCode)}&partner2Code=0&reporterCode=${encodeURIComponent(reporterCode)}&period=${encodeURIComponent(period)}&motCode=${encodeURIComponent(motCode)}&maxRecords=500${key}`;
  const data = await getJson(url);
  return {content:[{type:'text',text:JSON.stringify({source:'UN Comtrade',query:{reporterCode,partnerCode,cmdCode,period,flowCode},data:data.data||data},null,2)}]};
});

server.registerTool('trade_series', {
  title: 'UN Comtrade multi-year series',
  description: 'Retrieve a year-by-year UN Comtrade series for a product between a reporter and partner.',
  inputSchema: {
    reporterCode:z.string(), partnerCode:z.string(), cmdCode:z.string(), startYear:z.number().int(), endYear:z.number().int(), flowCode:z.enum(['M','X']).default('M')
  }
}, async ({reporterCode,partnerCode,cmdCode,startYear,endYear,flowCode}) => {
  const rows:any[]=[];
  for(let y=startYear;y<=endYear;y++){
    const key=COMTRADE_KEY?`&subscription-key=${encodeURIComponent(COMTRADE_KEY)}`:'';
    const url=`https://comtradeapi.un.org/public/v1/preview/C/A/HS?cmdCode=${encodeURIComponent(cmdCode)}&flowCode=${flowCode}&partnerCode=${encodeURIComponent(partnerCode)}&partner2Code=0&reporterCode=${encodeURIComponent(reporterCode)}&period=${y}&motCode=0&maxRecords=500${key}`;
    const d=await getJson(url); rows.push(...(d.data||[]));
  }
  return {content:[{type:'text',text:JSON.stringify({source:'UN Comtrade',rows},null,2)}]};
});

server.registerTool('world_bank_indicator', {
  title:'World Bank indicator',
  description:'Retrieve World Bank development/economic indicators by country and year.',
  inputSchema:{country:z.string().describe('ISO2 or ISO3 country code, e.g. DZ, CHN'),indicator:z.string().describe('Indicator code, e.g. NY.GDP.MKTP.CD'),startYear:z.number().int().default(2020),endYear:z.number().int().default(2025)}
}, async ({country,indicator,startYear,endYear})=>{
  const url=`https://api.worldbank.org/v2/country/${country}/indicator/${indicator}?format=json&per_page=100&date=${startYear}:${endYear}`;
  const d=await getJson(url);
  return {content:[{type:'text',text:JSON.stringify({source:'World Bank',country,indicator,data:d?.[1]||d},null,2)}]};
});

server.registerTool('company_wikidata', {
  title:'Company / organization lookup',
  description:'Search Wikidata for organizations/companies and return names, websites, countries and descriptions when available. This is a free discovery layer, not a complete company registry.',
  inputSchema:{query:z.string().describe('Company name or distinctive search term'),country:z.string().optional().describe('Optional country label, e.g. China or Algeria')}
}, async ({query,country})=>{
  const q=country?`${query} ${country}`:query;
  const sparql=`SELECT ?item ?itemLabel ?website ?countryLabel ?description WHERE { ?item rdfs:label ?label . FILTER(LANG(?label)="en") FILTER(CONTAINS(LCASE(?label), LCASE("${q.replace(/"/g,'\\"')}"))) OPTIONAL{?item wdt:P856 ?website} OPTIONAL{?item wdt:P17 ?country} OPTIONAL{?item schema:description ?description . FILTER(LANG(?description)="en")} SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 25`;
  const url='https://query.wikidata.org/sparql?format=json&query='+encodeURIComponent(sparql);
  const d=await getJson(url);
  const results=(d.results?.bindings||[]).map((x:any)=>({name:x.itemLabel?.value,website:x.website?.value,country:x.countryLabel?.value,description:x.description?.value,wikidata:x.item?.value}));
  return {content:[{type:'text',text:JSON.stringify({source:'Wikidata',query:q,results},null,2)}]};
});

server.registerTool('product_opportunity_brief', {
  title:'Industrial product opportunity brief',
  description:'Generate a structured research checklist for a steel/metal product. This does not invent market data; it tells Claude exactly which evidence to collect and compare.',
  inputSchema:{product:z.string(),hsCodes:z.array(z.string()).optional(),countries:z.array(z.string()).default(['Algeria','China']),years:z.array(z.number().int()).default([2021,2022,2023,2024,2025])}
}, async ({product,hsCodes,countries,years})=>{
  const brief={product,hsCodes,countries,years,requiredEvidence:[
    'UN Comtrade import/export value and quantity by year',
    'Top supplier countries and China share',
    'Unit-value trend where quantity/value permit it',
    'Named manufacturers and distributors with primary websites',
    'Algerian importers/distributors and local manufacturers',
    'Published prices with date/currency/incoterm where available',
    'Technical standards and specifications',
    'Local manufacturing inputs, machinery and process',
    'Regulatory/customs constraints and HS-code validation',
    'Evidence of demand: tenders, projects, catalogues, distributor listings'
  ],qualityRules:['Separate observed facts from estimates','Cite every external claim','Never treat a marketplace listing as proof of total market size','Do not infer demand from a single seller','Flag missing or stale data']};
  return {content:[{type:'text',text:JSON.stringify(brief,null,2)}]};
});

const httpServer=http.createServer(async(req,res)=>{
  if(req.url==='/health'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,name:'China-Algeria Industrial Market Intelligence'}));return;}
  if(req.url?.startsWith('/mcp')){
    const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined});
    await server.connect(transport);
    await transport.handleRequest(req,res);
    return;
  }
  res.writeHead(404);res.end('Not found');
});
httpServer.listen(PORT,'0.0.0.0',()=>console.log(`MCP listening on ${PORT}`));
