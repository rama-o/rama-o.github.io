/**
 * generate-badges.js
 *
 * Fetches live GitHub stats for each repo and writes SVG badge files
 * with Jersey 25 text converted to paths (no font dependency at render time).
 *
 * Usage:  node generate-badges.js
 * Env:    GITHUB_TOKEN  (optional, raises rate limit)
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Font glyph data (Jersey 25, size=5, baseline at y=0)
// Each entry: { adv: <advance_width>, d: <svg_path_at_origin> }
// __baseline_offset: add to cy to get baseline y in SVG coords
// ---------------------------------------------------------------------------

const GLYPHS = JSON.parse(
  readFileSync(resolve(__dirname, 'jersey25_glyphs.json'), 'utf8')
)
const BASELINE_OFFSET = GLYPHS.__baseline_offset  // 1.51626

/**
 * Convert a text string to an SVG <path d="..."> string.
 * Text is centered at (cx, cy) using text-anchor:middle + dominant-baseline:middle logic.
 */
function textToPath(text, cx, cy) {
  const baselineY = cy + BASELINE_OFFSET

  // Measure total advance width
  let totalW = 0
  for (const ch of text) {
    const g = GLYPHS[ch]
    totalW += g ? g.adv : 0.6  // fallback width for unknown chars
  }

  let x = cx - totalW / 2
  const parts = []

  for (const ch of text) {
    const g = GLYPHS[ch]
    if (!g) { x += 0.6; continue }
    if (g.d) {
      // Translate the glyph path from origin (0,0) to (x, baselineY)
      const translated = translatePath(g.d, x, baselineY)
      parts.push(translated)
    }
    x += g.adv
  }

  return parts.join(' ')
}

/**
 * Translate an SVG path string by (dx, dy).
 * Works by adding offsets to all coordinate pairs after command letters.
 * Supports M, L, H, V, C, S, Q, T, A, Z (absolute commands only, which
 * fontTools SVGPathPen outputs).
 */
function translatePath(d, dx, dy) {
  // We'll parse the path token by token
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g) || []

  let result = []
  let i = 0

  while (i < tokens.length) {
    const cmd = tokens[i]
    if (!/[MmLlHhVvCcSsQqTtAaZz]/.test(cmd)) { i++; continue }
    i++

    switch (cmd) {
      case 'M': case 'L': case 'T': {
        result.push(cmd)
        while (i < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
          const x = parseFloat(tokens[i++]) + dx
          const y = parseFloat(tokens[i++]) + dy
          result.push(`${r(x)} ${r(y)}`)
        }
        break
      }
      case 'H': {
        result.push('H')
        while (i < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
          result.push(r(parseFloat(tokens[i++]) + dx))
        }
        break
      }
      case 'V': {
        result.push('V')
        while (i < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
          result.push(r(parseFloat(tokens[i++]) + dy))
        }
        break
      }
      case 'C': {
        result.push('C')
        while (i < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
          for (let p = 0; p < 3; p++) {
            const x = parseFloat(tokens[i++]) + dx
            const y = parseFloat(tokens[i++]) + dy
            result.push(`${r(x)} ${r(y)}`)
          }
        }
        break
      }
      case 'S': case 'Q': {
        result.push(cmd)
        while (i < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
          for (let p = 0; p < 2; p++) {
            const x = parseFloat(tokens[i++]) + dx
            const y = parseFloat(tokens[i++]) + dy
            result.push(`${r(x)} ${r(y)}`)
          }
        }
        break
      }
      case 'Z': case 'z': {
        result.push('Z')
        break
      }
      default:
        // Skip unknown
        while (i < tokens.length && !/[A-Za-z]/.test(tokens[i])) i++
    }
  }

  return result.join('')
}

function r(n) {
  return Math.round(n * 10000) / 10000
}

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

const GH_HEADERS = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'rama-badge-script',
  ...(process.env.GITHUB_TOKEN
    ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : {}),
}

async function ghFetch(url) {
  const res = await fetch(url, { headers: GH_HEADERS })
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${url}`)
  return res.json()
}

async function fetchAllPages(url) {
  const results = []
  let next = url
  while (next) {
    const res = await fetch(next, { headers: GH_HEADERS })
    if (!res.ok) throw new Error(`GitHub API ${res.status}`)
    results.push(...(await res.json()))
    const link = res.headers.get('link') ?? ''
    const m = link.match(/<([^>]+)>;\s*rel="next"/)
    next = m ? m[1] : null
  }
  return results
}

async function getRepoStats(repo) {
  const base = `https://api.github.com/repos/${repo}`

  const [repoData, releases, latestRelease] = await Promise.all([
    ghFetch(base),
    ghFetch(`${base}/releases?per_page=1`),
    ghFetch(`${base}/releases/latest`).catch(() => null),
  ])

  // Total download count across all releases
  let totalDownloads = 0
  try {
    const allReleases = await fetchAllPages(`${base}/releases?per_page=100`)
    for (const rel of allReleases) {
      for (const asset of rel.assets) {
        totalDownloads += asset.download_count
      }
    }
  } catch (e) {
    console.warn(`Could not fetch download counts: ${e.message}`)
  }

  const tag = latestRelease?.tag_name?.replace(/^v/, '') ?? '—'
  const stars = repoData.stargazers_count ?? 0
  const issues = repoData.open_issues_count ?? 0

  return { tag, stars, issues, downloads: totalDownloads }
}

// ---------------------------------------------------------------------------
// SVG badge builder
// ---------------------------------------------------------------------------

/**
 * Renders one badge SVG with live data as path text.
 *
 * Sections (left→right, each 30 units wide in a 120×10 viewBox):
 *   0: Stars
 *   1: Issues
 *   2: Downloads
 *   3: Release
 */
function buildBadgeSvg(stats, iconPaths) {
  const { tag, stars, issues, downloads } = stats

  function formatNum(n) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
    return String(n)
  }

  const labels = [
    { value: formatNum(stars),     color: '#e5c890', icon: iconPaths.stars },
    { value: formatNum(issues),    color: '#e3ac86', icon: iconPaths.issues },
    { value: formatNum(downloads), color: '#ca9ee6', icon: iconPaths.downloads },
    { value: tag,                  color: '#b4d89c', icon: iconPaths.release },
  ]

  const sections = labels.map((lbl, i) => {
    const tx = i * 30
    // cx of text area = tx + 10 (icon) + 10 (half of label rect) = tx + 20
    const textPath = textToPath(lbl.value, 20, 5)

    return `
    <g class="badge" transform="translate(${tx} 0)">
      <path fill="${lbl.color}" d="${lbl.icon}"/>
      <rect fill="${lbl.color}" width="20" height="10" x="10" y="0"/>
      ${textPath ? `<path fill="#313244" d="${textPath}"/>` : ''}
    </g>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="35" viewBox="0 0 120 10">
  <g>
    <rect width="120" height="10" fill="#313244"/>
    ${sections}
  </g>
</svg>`
}

// ---------------------------------------------------------------------------
// Icon paths (extracted from original badge.svg — already pixel-art paths)
// ---------------------------------------------------------------------------

const ICONS = {
  stars: 'M5.929 6.145h.216v.866h-.433v-.217H5.28v-.216h-.432v-.216h-.433v.216H3.98v.216h-.433v.217h-.433v-.866h.217V5.063h-.217v-.216H2.9V4.63h-.217v-.216h-.216v-.217H2.25v-.432h1.515v-.433h.216v-.433h.216v-.433h.217V2.25h.433v.216h.216v.433h.216v.433h.217v.433H7.01v.432h-.217v.217h-.216v.216h-.216v.217h-.217v.216H5.93z',
  issues: 'M4.115 2.249v.216h1.3V2.25zm1.3.216v.217h.216v-.217zm0 .217h-.217V4.63h.217zm0 1.948v.217h.216V4.63zm.216.217v.216h.217v-.216zm.217.216v.217h.216v-.217zm.216.217v.216h.217V5.28zm.217.216v.433h.216v-.433zm.216.433v.433h.216v-.433zm.216.433v.433h.217v-.433zm0 .433H2.786v.216h3.896zm-3.896 0v-.433H2.6v.433zm0-.433h.216v-.433H2.6zm.216-.433h.217v-.433h-.217zm.217-.433h.216V5.28h-.216zm.216-.216h.217v-.217h-.217zm.217-.217h.216v-.216h-.216zm.216-.216h.216V4.63H3.9zm.216-.217h.217V2.682h-.217zm0-1.948v-.217H3.9v.217zm-.432 2.598v.216h-.217v.433h-.216v.433h-.217v.216h3.464v-.216h-.216v-.433h-.217v-.433h-.216V5.28h-.217v-.217h-.216v-.216h-.65v.216h-.217v.217zm1.082.216h.217v.217h-.217zm-.866.217h.433v.432h-.433z',
  downloads: 'M5.55 6.794h.432v-.216h.433v-.216h.216v-.217h.217v-.433h.216V5.28h.217V3.981h-.217v-.433h-.216v-.433h-.217V2.9h-.216v-.217h-.433v-.216h-.433V2.25h-1.298v.216h-.433v.216h-.433V2.9h-.216v.216h-.217v.433h-.216v.433h-.217v1.298h.217v.433h.216v.433h.217v.217h.216v.216h.433v.216h.433v.217h1.298zm-1.083-1.298v-.217h-.216v-.216h-.217v-.216h-.216V4.63h.866V3.332h.432V4.63h.866v.217h-.216v.216h-.217v.216h-.216v.217h-.217v.216h-.432v-.216z',
  release: 'M6.333 2.547v.216H5.9v.217h-.433v.216H5.25v.217h-.216v.433h.216v.432h.217v.433H5.9v-.216h.432v-.217h.433v-.216h.217v-.216h.216v-.433h.217v-.866zm-3.679.65v.649h.217v.432h.216v.433h.216v.217h.217v.216h.433v.217h.865v1.515h.433V4.495h-.216v-.433h-.217v-.216h-.216v-.217h-.433v-.216h-.433v-.217z',
}

// ---------------------------------------------------------------------------
// Repo definitions — add/remove as needed
// ---------------------------------------------------------------------------

const REPOS = {
  mako:  'rama-io/mako',
  txori: 'rama-io/txori',
  tui:   'rama-io/tui',
}

// Map repo key → output filename
const BADGE_FILES = {
  rama:  '../img/badge.svg',
  mako:  '../img/badge_mako.svg',
  txori: '../img/badge_txori.svg',
  tui:   '../img/badge_tui.svg',
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Fetching GitHub stats…\n')

  const results = await Promise.allSettled(
    Object.entries(REPOS).map(async ([key, repo]) => {
      const stats = await getRepoStats(repo)
      console.log(`✓ ${key} (${repo})`)
      console.log(`  stars=${stats.stars}  issues=${stats.issues}  downloads=${stats.downloads}  tag=${stats.tag}`)
      return [key, stats]
    })
  )

  console.log('\n Generating badges…\n')

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error(`✗ ${result.reason}`)
      continue
    }

    const [key, stats] = result.value
    const outFile = resolve(__dirname, BADGE_FILES[key])
    const svg = buildBadgeSvg(stats, ICONS)
    writeFileSync(outFile, svg, 'utf8')
    console.log(`✓ Written ${BADGE_FILES[key]}`)
  }

  console.log('\n Done\n')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})