#!/usr/bin/env bun

import { $ } from "bun"
import path from "path"
import fs from "fs"

const dir = path.resolve(import.meta.dir, "..")
process.chdir(dir)

const pkg = await Bun.file("package.json").json()
const version = pkg.version

// Platform targets
const targets = [
  { os: "darwin", arch: "arm64", bunTarget: "bun-darwin-arm64" },
  { os: "darwin", arch: "x64", bunTarget: "bun-darwin-x64" },
  { os: "linux", arch: "arm64", bunTarget: "bun-linux-arm64" },
  { os: "linux", arch: "x64", bunTarget: "bun-linux-x64" },
  { os: "windows", arch: "x64", bunTarget: "bun-windows-x64" },
]

// Check for --single flag to only build current platform
const singleFlag = process.argv.includes("--single")

const filteredTargets = singleFlag
  ? targets.filter((t) => {
      const currentOs = process.platform === "win32" ? "windows" : process.platform
      return t.os === currentOs && t.arch === process.arch
    })
  : targets

console.log(`Building HN CLI v${version}`)
console.log(`Targets: ${filteredTargets.map((t) => `${t.os}-${t.arch}`).join(", ")}`)
console.log("")

// Clean and create dist directory
await $`rm -rf dist/binaries`
await $`mkdir -p dist/binaries`

// Install all platform variants of @opentui/core
console.log("Installing cross-platform dependencies...")
await $`bun install --os="*" --cpu="*" @opentui/core@${pkg.dependencies["@opentui/core"]}`
console.log("")

// Build each target
for (const target of filteredTargets) {
  const pkgName = `hn-cli-${target.os}-${target.arch}`
  const fullPkgName = `@brianlovin/${pkgName}`
  const binary = target.os === "windows" ? "hn.exe" : "hn"
  const outDir = `dist/binaries/${pkgName}`

  console.log(`Building ${fullPkgName}...`)

  // Create directory structure
  await $`mkdir -p ${outDir}/bin`

  // Compile the binary
  await Bun.build({
    entrypoints: ["./src/index.ts"],
    compile: {
      target: target.bunTarget as any,
      outfile: `${outDir}/bin/${binary}`,
    },
  })

  // Create package.json for this platform package
  const platformPkg = {
    name: fullPkgName,
    version: version,
    description: `HN CLI binary for ${target.os}-${target.arch}`,
    license: "MIT",
    repository: pkg.repository,
    os: [target.os === "windows" ? "win32" : target.os],
    cpu: [target.arch],
  }

  await Bun.write(`${outDir}/package.json`, JSON.stringify(platformPkg, null, 2))

  console.log(`  ✓ Built ${outDir}/bin/${binary}`)
}

console.log("")
console.log("Build complete!")
console.log("")
console.log("Platform packages created in dist/binaries/")
await $`ls -la dist/binaries/`
