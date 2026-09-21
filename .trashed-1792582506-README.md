# China–Algeria Industrial Market Intelligence MCP

A small remote MCP server for Claude focused on China–Algeria industrial/steel market research.

## Tools
- `trade_data` — UN Comtrade product trade query
- `trade_series` — multi-year UN Comtrade series
- `world_bank_indicator` — World Bank economic indicators
- `company_wikidata` — free company/organization discovery through Wikidata
- `product_opportunity_brief` — evidence checklist for industrial-product research

## Run locally
```bash
npm install
npm run dev
```
Health: http://localhost:3000/health
MCP endpoint: http://localhost:3000/mcp

## Free UN Comtrade key
A free Comtrade account can issue a free API key. Set:
`COMTRADE_API_KEY=...`

Without a key, the server uses Comtrade preview endpoints with stricter limits.

## Remote Claude connector
Claude's custom connector must reach the MCP endpoint over the public internet. Deploy this server to a public HTTPS host, then in Claude:
Customize → Connectors → + → Add custom connector → enter the public `/mcp` URL.

Claude Free currently permits one custom connector.
