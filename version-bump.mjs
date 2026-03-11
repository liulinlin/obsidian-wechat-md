import { readFileSync, writeFileSync } from 'node:fs'

// 支持两种调用方式：
//   直接调用：node version-bump.mjs 1.0.1-beta.0
//   npm version：npm version 1.0.1-beta.0（由 npm 注入 npm_package_version）
const targetVersion = process.argv[2] || process.env.npm_package_version

if (!targetVersion) {
  console.error('Usage: node version-bump.mjs <version>')
  console.error('Example: node version-bump.mjs 1.0.1-beta.0')
  process.exit(1)
}

if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(targetVersion)) {
  console.error(`Error: Invalid version format "${targetVersion}"`)
  console.error('Expected semver, e.g. 1.0.0 or 1.0.1-beta.0')
  process.exit(1)
}

// 1. 更新 manifest.json
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'))
const { minAppVersion } = manifest
if (!minAppVersion) {
  console.error('Error: manifest.json is missing "minAppVersion" field')
  process.exit(1)
}
manifest.version = targetVersion
writeFileSync('manifest.json', JSON.stringify(manifest, null, '\t') + '\n')
console.log(`manifest.json: version → ${targetVersion}`)

// 2. 更新 versions.json（新增条目，保留历史记录）
const versions = JSON.parse(readFileSync('versions.json', 'utf8'))
versions[targetVersion] = minAppVersion
writeFileSync('versions.json', JSON.stringify(versions, null, '\t') + '\n')
console.log(`versions.json: added "${targetVersion}": "${minAppVersion}"`)

// 3. 更新 package.json
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
pkg.version = targetVersion
writeFileSync('package.json', JSON.stringify(pkg, null, '\t') + '\n')
console.log(`package.json: version → ${targetVersion}`)

console.log('\nDone! Next steps:')
console.log(`  git add manifest.json versions.json package.json`)
console.log(`  git commit -m "chore: bump version to ${targetVersion}"`)
console.log(`  git tag ${targetVersion}`)
console.log(`  git push && git push --tags`)
