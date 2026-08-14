# Model Context Protocol

RoboPartPicker exposes MCP over the Streamable HTTP transport.

## Public read-only endpoint

Production endpoint:

```text
https://robopartpicker-production.ludomi2502.workers.dev/mcp
```

No account or API key is required. The public server exposes read-only tools for projects, project artifacts, components, suppliers, and portable RPPS validation.

For clients whose configuration uses the common `mcpServers` shape:

```json
{
  "mcpServers": {
    "robopartpicker": {
      "url": "https://robopartpicker-production.ludomi2502.workers.dev/mcp"
    }
  }
}
```

Client configuration schemas differ. If a client asks for a transport, select **Streamable HTTP** or **HTTP**, then use the endpoint URL above. Do not configure it as a local stdio command or an SSE-only endpoint.

Machine-readable service discovery is available at:

```text
https://robopartpicker-production.ludomi2502.workers.dev/.well-known/mcp.json
```

### Why opening `/mcp` in a browser returns 406

A normal browser navigation does not send the MCP-required `Accept: text/event-stream` header. The MCP SDK therefore returns `406 Not Acceptable`. This is expected transport behavior and does not mean the endpoint is unavailable. Configure the URL in a Streamable HTTP MCP client instead.

The following read-only request verifies the protocol handshake directly:

```bash
curl -sS https://robopartpicker-production.ludomi2502.workers.dev/mcp \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"mcp-check","version":"1.0.0"}}}'
```

## Private OAuth endpoint

The private endpoint is:

```text
https://robopartpicker-production.ludomi2502.workers.dev/mcp/private
```

It requires OAuth and the narrow `rpp:read` or `rpp:write` scopes. A compatible remote MCP client should discover authorization details from the protected-resource metadata instead of using a manually copied token:

```text
https://robopartpicker-production.ludomi2502.workers.dev/.well-known/oauth-protected-resource/mcp/private
```

The advertised authorization server supports authorization code flow with PKCE, dynamic client registration, and refresh tokens. Write-capable tools remain scoped, audited, and confirmation-gated.

## Local development

When the application is running locally, replace the production origin with `http://127.0.0.1:8080`. The paths remain `/mcp`, `/mcp/private`, and `/.well-known/*`.
