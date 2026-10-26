// Nephele does not set Content-Length for HEAD responses when the response is
// uncompressed. WebDAV clients (notably Music Assistant) rely on it for range
// and size discovery. Apply a small, idempotent source patch to the installed
// dependency. Using JavaScript instead of the `patch` binary keeps npx/npm
// installs working on Windows and avoids shelling out at runtime.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function patchNephele(root = packageRoot) {
  let nepheleRoot
  try {
    nepheleRoot = dirname(createRequire(import.meta.url).resolve('nephele/package.json'))
  } catch {
    nepheleRoot = join(root, 'node_modules', 'nephele')
  }

  const target = join(nepheleRoot, 'dist', 'Methods', 'GET_HEAD.js')
  if (!existsSync(target)) {
    return false
  }

  const content = readFileSync(target, 'utf8')
  const marker = "if (request.method === 'HEAD' && encoding === 'identity')"
  if (content.includes(marker)) {
    return true
  }

  const needle = "            if (request.method !== 'HEAD') {"
  if (!content.includes(needle)) {
    return false
  }

  const headResponse = `            if (request.method === 'HEAD' && encoding === 'identity') {
                response.set({
                    'Content-Length': \`\${await resource.getLength()}\`,
                });
            }
`

  writeFileSync(target, content.replace(needle, headResponse + needle))
  return true
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const patched = patchNephele()
  if (!patched) {
    console.warn('Could not apply the Nephele HEAD Content-Length patch; continuing without it.')
  }
}
