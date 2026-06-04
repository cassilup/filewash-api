#!/usr/bin/env node
// filewash MCP server (stdio). Exposes every tool in the registry to any MCP
// client (Claude Desktop, Cursor, Claude Code). Privacy-first: files are
// processed in memory and results written only where the caller asks.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { TOOLS } from '../engine/tools.js'
import { loadInput, writeOutput } from '../engine/io.js'

const server = new McpServer({ name: 'filewash', version: '0.1.0' })

// Build the per-tool input shape: file path(s) + the tool's own params + optional outputPath.
function inputShape(tool) {
  const shape = { ...tool.params.shape }
  if (tool.files.max === 1) shape.input = z.string().describe('Path to the input file (or a data: URL / base64 string).')
  else if (tool.files.max > 1) shape.inputs = z.array(z.string()).min(tool.files.min).describe('Paths to the input files (or data: URLs / base64).')
  shape.outputPath = z.string().optional().describe('Where to write the result. Defaults to a temp file; the path is returned.')
  return shape
}

for (const tool of TOOLS) {
  server.registerTool(
    tool.name,
    { description: tool.description, inputSchema: inputShape(tool) },
    async (args) => {
      try {
        const { input, inputs, outputPath, ...params } = args
        const files = tool.files.max === 0 ? [] : (inputs || [input]).map(loadInput)
        const result = await tool.run({ files, params })
        const path = writeOutput(result, outputPath)
        return {
          content: [{
            type: 'text',
            text: `${tool.name} ✓ — wrote ${result.buffer.length} bytes to ${path}\n${JSON.stringify(result.meta || {})}`,
          }],
        }
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: `${tool.name} failed: ${e.message}` }] }
      }
    },
  )
}

await server.connect(new StdioServerTransport())
