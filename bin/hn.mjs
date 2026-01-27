#!/usr/bin/env node

import { spawnSync } from "child_process"
import { existsSync, realpathSync } from "fs"
import { dirname, join } from "path"
import { platform as osPlatform, arch as osArch } from "os"
import { fileURLToPath } from "url"

function run(target) {
  const result = spawnSync(target, process.argv.slice(2), {
    stdio: "inherit",
  })
  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }
  const code = typeof result.status === "number" ? result.status : 0
  process.exit(code)
}

// Resolve symlinks to get the real script location
const __filename = fileURLToPath(import.meta.url)
const scriptPath = realpathSync(__filename)
const scriptDir = dirname(scriptPath)

// Map platform/arch to package names
const platformMap = {
  darwin: "darwin",
  linux: "linux",
  win32: "windows",
}
const archMap = {
  x64: "x64",
  arm64: "arm64",
}

const platform = platformMap[osPlatform()] || osPlatform()
const arch = archMap[osArch()] || osArch()
const pkgName = `@brianlovin/hn-cli-${platform}-${arch}`
const binary = platform === "windows" ? "hn.exe" : "hn"

// Search for the platform-specific binary in node_modules
function findBinary(startDir) {
  let current = startDir
  while (true) {
    const modules = join(current, "node_modules")
    if (existsSync(modules)) {
      // Check for the platform-specific package
      const candidate = join(modules, "@brianlovin", `hn-cli-${platform}-${arch}`, "bin", binary)
      if (existsSync(candidate)) {
        return candidate
      }
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

const resolved = findBinary(scriptDir)
if (!resolved) {
  console.error("")
  console.error(`Error: Could not find the HN CLI binary for your platform (${platform}-${arch}).`)
  console.error("")
  console.error("You can try manually installing the platform package:")
  console.error(`  npm install ${pkgName}`)
  console.error("")
  process.exit(1)
}

run(resolved)
