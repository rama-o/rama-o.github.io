import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getRepoStats } from './github.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Font: Jersey 25 glyphs pre-extracted as SVG paths
// { adv, d } per character; __baseline_offset for vertical centering
// ---------------------------------------------------------------------------

const GLYPHS = JSON.parse(
	readFileSync(resolve(__dirname, 'jersey25_glyphs.json'), 'utf8')
)
const BASELINE_OFFSET = GLYPHS.__baseline_offset

function textToPath(text, cx, cy) {
	const baselineY = cy + BASELINE_OFFSET

	let totalW = 0
	for (const ch of text) totalW += GLYPHS[ch]?.adv ?? 0.6

	let x = cx - totalW / 2
	const parts = []

	for (const ch of text) {
		const g = GLYPHS[ch]
		if (!g) { x += 0.6; continue }
		if (g.d) parts.push(translatePath(g.d, x, baselineY))
		x += g.adv
	}

	return parts.join(' ')
}

function translatePath(d, dx, dy) {
	const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g) || []
	const out = []
	let i = 0

	while (i < tokens.length) {
		const cmd = tokens[i]
		if (!/[MmLlHhVvCcSsQqTtAaZz]/.test(cmd)) { i++; continue }
		i++

		switch (cmd) {
			case 'M': case 'L': case 'T': {
				out.push(cmd)
				while (i < tokens.length && !/[A-Za-z]/.test(tokens[i]))
					out.push(`${r(+tokens[i++] + dx)} ${r(+tokens[i++] + dy)}`)
				break
			}
			case 'H': {
				out.push('H')
				while (i < tokens.length && !/[A-Za-z]/.test(tokens[i]))
					out.push(r(+tokens[i++] + dx))
				break
			}
			case 'V': {
				out.push('V')
				while (i < tokens.length && !/[A-Za-z]/.test(tokens[i]))
					out.push(r(+tokens[i++] + dy))
				break
			}
			case 'C': {
				out.push('C')
				while (i < tokens.length && !/[A-Za-z]/.test(tokens[i]))
					for (let p = 0; p < 3; p++)
						out.push(`${r(+tokens[i++] + dx)} ${r(+tokens[i++] + dy)}`)
				break
			}
			case 'S': case 'Q': {
				out.push(cmd)
				while (i < tokens.length && !/[A-Za-z]/.test(tokens[i]))
					for (let p = 0; p < 2; p++)
						out.push(`${r(+tokens[i++] + dx)} ${r(+tokens[i++] + dy)}`)
				break
			}
			case 'Z': case 'z': {
				out.push('Z')
				break
			}
			default:
				while (i < tokens.length && !/[A-Za-z]/.test(tokens[i])) i++
		}
	}

	return out.join('')
}

const r = n => Math.round(n * 10000) / 10000

// ---------------------------------------------------------------------------
// SVG builder
// ---------------------------------------------------------------------------

const ICONS = {
	stars:     'M5.929 6.145h.216v.866h-.433v-.217H5.28v-.216h-.432v-.216h-.433v.216H3.98v.216h-.433v.217h-.433v-.866h.217V5.063h-.217v-.216H2.9V4.63h-.217v-.216h-.216v-.217H2.25v-.432h1.515v-.433h.216v-.433h.216v-.433h.217V2.25h.433v.216h.216v.433h.216v.433h.217v.433H7.01v.432h-.217v.217h-.216v.216h-.216v.217h-.217v.216H5.93z',
	issues:    'M4.115 2.249v.216h1.3V2.25zm1.3.216v.217h.216v-.217zm0 .217h-.217V4.63h.217zm0 1.948v.217h.216V4.63zm.216.217v.216h.217v-.216zm.217.216v.217h.216v-.217zm.216.217v.216h.217V5.28zm.217.216v.433h.216v-.433zm.216.433v.433h.216v-.433zm.216.433v.433h.217v-.433zm0 .433H2.786v.216h3.896zm-3.896 0v-.433H2.6v.433zm0-.433h.216v-.433H2.6zm.216-.433h.217v-.433h-.217zm.217-.433h.216V5.28h-.216zm.216-.216h.217v-.217h-.217zm.217-.217h.216v-.216h-.216zm.216-.216h.216V4.63H3.9zm.216-.217h.217V2.682h-.217zm0-1.948v-.217H3.9v.217zm-.432 2.598v.216h-.217v.433h-.216v.433h-.217v.216h3.464v-.216h-.216v-.433h-.217v-.433h-.216V5.28h-.217v-.217h-.216v-.216h-.65v.216h-.217v.217zm1.082.216h.217v.217h-.217zm-.866.217h.433v.432h-.433z',
	downloads: 'M5.55 6.794h.432v-.216h.433v-.216h.216v-.217h.217v-.433h.216V5.28h.217V3.981h-.217v-.433h-.216v-.433h-.217V2.9h-.216v-.217h-.433v-.216h-.433V2.25h-1.298v.216h-.433v.216h-.433V2.9h-.216v.216h-.217v.433h-.216v.433h-.217v1.298h.217v.433h.216v.433h.217v.217h.216v.216h.433v.216h.433v.217h1.298zm-1.083-1.298v-.217h-.216v-.216h-.217v-.216h-.216V4.63h.866V3.332h.432V4.63h.866v.217h-.216v.216h-.217v.216h-.216v.217h-.217v.216h-.432v-.216z',
	release:   'M6.333 2.547v.216H5.9v.217h-.433v.216H5.25v.217h-.216v.433h.216v.432h.217v.433H5.9v-.216h.432v-.217h.433v-.216h.217v-.216h.216v-.433h.217v-.866zm-3.679.65v.649h.217v.432h.216v.433h.216v.217h.217v.216h.433v.217h.865v1.515h.433V4.495h-.216v-.433h-.217v-.216h-.216v-.217h-.433v-.216h-.433v-.217z',
}

const BADGE_FILES = {
	mako:  '../img/badge_mako.svg',
	txori: '../img/badge_txori.svg',
	tui:   '../img/badge_tui.svg',
}

function formatNum(n) {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
	return String(n)
}

function buildBadgeSvg({ tag, stars, issues, downloads }) {
	const labels = [
		{ value: formatNum(stars),     color: '#e5c890', icon: ICONS.stars },
		{ value: formatNum(issues),    color: '#e3ac86', icon: ICONS.issues },
		{ value: formatNum(downloads), color: '#ca9ee6', icon: ICONS.downloads },
		{ value: tag,                  color: '#b4d89c', icon: ICONS.release },
	]

	const sections = labels.map((lbl, i) => {
		const tx = i * 30
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
// Public API — called by build.mjs with pre-fetched releases
// ---------------------------------------------------------------------------

export async function generateBadges(repos, releases) {
	const statsResults = await Promise.allSettled(
		Object.entries(repos).map(async ([key, repo]) => {
			const stats = await getRepoStats(repo)
			// Merge the release data already fetched by build.mjs
			if (releases[key]) {
				stats.tag = releases[key].tag.replace(/^v/, '')
			}
			return [key, stats]
		})
	)

	for (const result of statsResults) {
		if (result.status === 'rejected') {
			console.error(`  ✗ badge: ${result.reason.message}`)
			continue
		}

		const [key, stats] = result.value
		const outFile = resolve(__dirname, BADGE_FILES[key])
		writeFileSync(outFile, buildBadgeSvg(stats), 'utf8')
		console.log(`  ✓ ${BADGE_FILES[key]}`)
	}
}
