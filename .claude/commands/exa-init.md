# Exa MCP Setup Guide

**Canonical reference:** https://docs.exa.ai/reference/exa-mcp

If anything below looks outdated or contradicts real MCP behavior, fetch that URL — it is the source of truth for MCP setup, auth, and tools. Report staleness back to the user.

---

## 🔌 Exa MCP Server for the user's MCP client

Give the user's MCP client real-time web search and page fetching with Exa's hosted MCP server:

```
https://mcp.exa.ai/mcp
```

Most clients use the standard `mcpServers` shape. Locate the user's MCP client's MCP config, then create or merge this in (keep any existing servers):

```json
{
  "mcpServers": {
    "exa": {
      "url": "https://mcp.exa.ai/mcp"
    }
  }
}
```

Where the config lives and what the URL key is called varies by client — use the matching row, and if the client is not listed, check its MCP docs for the equivalent:

| Client             | Where to add it                                                         | URL key                |
| ------------------ | ----------------------------------------------------------------------- | ---------------------- |
| OpenCode           | `opencode.json` (under `mcp`, with `"type": "remote"`)                  | `url`                  |
| Kiro               | `~/.kiro/settings/mcp.json` (under `mcpServers`)                        | `url`                  |
| Windsurf           | `~/.codeium/windsurf/mcp_config.json` (under `mcpServers`)              | `serverUrl`            |
| Google Antigravity | Agent panel → Manage MCP Servers → View Raw config (under `mcpServers`) | `serverUrl`            |
| Zed                | Zed `settings.json` (under `context_servers`)                           | `url`                  |
| Gemini CLI         | `~/.gemini/settings.json` (under `mcpServers`)                          | `httpUrl`              |
| Warp               | Settings → MCP Servers → Add MCP Server (top-level `exa`)               | `url`                  |
| v0 by Vercel       | Prompt Tools → Add MCP                                                  | paste the URL directly |

If the client does not support remote (HTTP) MCP servers, use the `mcp-remote` bridge instead:

```json
{
  "mcpServers": {
    "exa": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.exa.ai/mcp"]
    }
  }
}
```

Or run the local [`exa-mcp-server` npm package](https://www.npmjs.com/package/exa-mcp-server) with the user's [Exa API key](https://dashboard.exa.ai/api-keys):

```json
{
  "mcpServers": {
    "exa": {
      "command": "npx",
      "args": ["-y", "exa-mcp-server"],
      "env": {
        "EXA_API_KEY": "your_api_key"
      }
    }
  }
}
```

After editing config, have the user restart the user's MCP client.

**Verify it works:** in a fresh session after setup, ask the client something that needs the web, e.g. "Search for recent developments in AI agents and summarize the key trends." The `web_search_exa` tool should be called.

**Authentication:** the hosted server works without a key on a small free plan — there is no sign-in step unless the client installed Exa as a plugin. Once the free plan is used up the server answers with a 429 (some clients, Hermes included, show this as a search that hangs and times out rather than an error). To lift the limit or use it in production, add the user's [Exa API key](https://dashboard.exa.ai/api-keys) as a header wherever the client's config accepts one:

```json
{
  "exa": {
    "url": "https://mcp.exa.ai/mcp",
    "headers": {
      "x-api-key": "YOUR_EXA_API_KEY"
    }
  }
}
```

**Tools:** `web_search_exa` (search the web, get clean content) and `web_fetch_exa` (read a page as markdown) are on by default. `agent_run` (multi-step Exa Agent research; needs auth) and `web_search_advanced_exa` (category/domain/date filters, highlights, summaries, subpage crawling) are opt-in — append `?tools=` to the URL to choose exactly which tools the client sees:

```
https://mcp.exa.ai/mcp?tools=web_search_exa,web_fetch_exa,agent_run,web_search_advanced_exa
```

**Troubleshooting:**

- Tools not appearing → restart the client after changing config; some clients need a full restart to detect new MCP servers.
- Rate limit error (429), or the first search hangs and times out with no result → the free plan is used up; add the `x-api-key` header above.
- Claude Desktop not connecting → use the built-in connector (**+** or **Add connectors** → **Connectors** → search **Exa** → **+**), not a config file.

📖 Full docs: [docs.exa.ai/reference/exa-mcp](https://docs.exa.ai/reference/exa-mcp)

---

## Resources

- Docs: https://exa.ai/docs
- Dashboard: https://dashboard.exa.ai
- API Status: https://status.exa.ai
