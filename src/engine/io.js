// Small I/O helpers shared by the MCP transport.
// Zero-retention by default: buffers live in memory; output is written only where
// the caller asks (or a temp file), never logged.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let counter = 0

// Resolve a string input into a Buffer: a local file path, a data: URL, or raw base64.
export function loadInput(str) {
  if (Buffer.isBuffer(str)) return str
  if (typeof str !== 'string') throw new Error('input must be a file path, data: URL, or base64 string')
  if (str.startsWith('data:')) {
    const comma = str.indexOf(',')
    return Buffer.from(str.slice(comma + 1), 'base64')
  }
  if (existsSync(str)) return readFileSync(str)
  return Buffer.from(str, 'base64')
}

// Write a result Buffer to the requested path, or a temp file. Returns the path.
export function writeOutput(result, outputPath) {
  const path = outputPath || join(tmpdir(), `filewash-${process.pid}-${counter++}.${result.ext}`)
  writeFileSync(path, result.buffer)
  return path
}
