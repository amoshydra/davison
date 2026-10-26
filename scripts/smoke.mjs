// Packaging smoke test: pack the package, install it as a consumer would, and
// verify the CLI and the Nephele runtime patch. Build first: npm pack runs the
// prepack build.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const run = (args, cwd) =>
  execFileSync('npm', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

let failures = 0
const check = (label, fn) => {
  try {
    fn()
    console.log(`  ok    ${label}`)
  } catch (error) {
    failures += 1
    console.log(`  FAIL  ${label}: ${error.message}`)
  }
}

const tarball = run(['pack', '--silent'], root).trim().split('\n').pop()
const tarballPath = join(root, tarball)
console.log(`packed ${tarball}`)

const dir = mkdtempSync(join(tmpdir(), 'davison-smoke-'))
writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'smoke', private: true }))
run(['install', '--silent', '--no-audit', '--no-fund', tarballPath], dir)

const pkgDir = join(dir, 'node_modules', '@amoshydra', 'davison')
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))

check('license is present', () => {
  if (pkg.license !== 'MIT') throw new Error(`unexpected license: ${pkg.license}`)
})
check('bin is shipped', () => {
  if (!existsSync(join(pkgDir, 'bin', 'davison.js'))) throw new Error('missing bin')
})
check('server build is shipped', () => {
  if (!existsSync(join(pkgDir, 'dist-server', 'index.js'))) throw new Error('missing dist-server')
})
check('frontend build is shipped', () => {
  if (!existsSync(join(pkgDir, 'dist', 'index.html'))) throw new Error('missing dist')
})
check('patch script is shipped', () => {
  if (!existsSync(join(pkgDir, 'scripts', 'patch-nephele.mjs'))) throw new Error('missing patch script')
})

const help = execFileSync(join(dir, 'node_modules', '.bin', 'davison'), ['--help'], {
  cwd: dir,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'production' },
})
check('CLI --help runs', () => {
  if (!help.includes('Usage: davison')) throw new Error(`unexpected help: ${help.slice(0, 100)}`)
})

const getHead = join(dir, 'node_modules', 'nephele', 'dist', 'Methods', 'GET_HEAD.js')
check('Nephele HEAD patch applied', () => {
  const content = readFileSync(getHead, 'utf8')
  if (!content.includes("request.method === 'HEAD' && encoding === 'identity'")) {
    throw new Error('HEAD Content-Length patch missing')
  }
})

rmSync(dir, { recursive: true, force: true })
rmSync(tarballPath, { force: true })

if (failures > 0) {
  console.log(`\n${failures} smoke check(s) failed`)
  process.exit(1)
}
console.log('\nall smoke checks passed')
