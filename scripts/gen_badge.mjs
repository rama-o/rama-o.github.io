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
		if (!g) {
			x += 0.6
			continue
		}
		if (g.d) parts.push(translatePath(g.d, x, baselineY))
		x += g.adv
	}

	return parts.join(' ')
}

function translatePath(d, dx, dy) {
	const tokens =
		d.match(
			/[MmLlHhVvCcSsQqTtAaZz]|[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g
		) || []
	const out = []
	let i = 0

	while (i < tokens.length) {
		const cmd = tokens[i]
		if (!/[MmLlHhVvCcSsQqTtAaZz]/.test(cmd)) {
			i++
			continue
		}
		i++

		switch (cmd) {
			case 'M':
			case 'L':
			case 'T': {
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
			case 'S':
			case 'Q': {
				out.push(cmd)
				while (i < tokens.length && !/[A-Za-z]/.test(tokens[i]))
					for (let p = 0; p < 2; p++)
						out.push(`${r(+tokens[i++] + dx)} ${r(+tokens[i++] + dy)}`)
				break
			}
			case 'Z':
			case 'z': {
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
	stars: {
		d: 'M5.929 6.145h.216v.866h-.433v-.217H5.28v-.216h-.432v-.216h-.433v.216H3.98v.216h-.433v.217h-.433v-.866h.217V5.063h-.217v-.216H2.9V4.63h-.217v-.216h-.216v-.217H2.25v-.432h1.515v-.433h.216v-.433h.216v-.433h.217V2.25h.433v.216h.216v.433h.216v.433h.217v.433H7.01v.432h-.217v.217h-.216v.216h-.216v.217h-.217v.216H5.93z',
	},
	science: {
		d: 'M 8.5019531 1.5 L 8.5019531 2.5 L 14.503906 2.5 L 14.503906 1.5 L 8.5019531 1.5 z M 14.503906 2.5 L 14.503906 3.5 L 15.503906 3.5 L 15.503906 2.5 L 14.503906 2.5 z M 14.503906 3.5 L 13.501953 3.5 L 13.501953 12.501953 L 14.503906 12.501953 L 14.503906 3.5 z M 14.503906 12.501953 L 14.503906 13.501953 L 15.503906 13.501953 L 15.503906 12.501953 L 14.503906 12.501953 z M 15.503906 13.501953 L 15.503906 14.503906 L 16.503906 14.503906 L 16.503906 15.503906 L 17.503906 15.503906 L 17.503906 16.503906 L 18.503906 16.503906 L 18.503906 15.501953 L 17.503906 15.501953 L 17.503906 14.501953 L 16.503906 14.501953 L 16.503906 13.501953 L 15.503906 13.501953 z M 18.503906 16.503906 L 18.503906 18.503906 L 19.503906 18.503906 L 19.503906 16.503906 L 18.503906 16.503906 z M 19.503906 18.503906 L 19.503906 20.503906 L 20.503906 20.503906 L 20.503906 18.503906 L 19.503906 18.503906 z M 20.503906 20.503906 L 20.503906 22.503906 L 21.503906 22.503906 L 21.503906 20.503906 L 20.503906 20.503906 z M 19.503906 20.503906 L 18.503906 20.503906 L 18.503906 18.503906 L 17.503906 18.503906 L 17.503906 16.503906 L 16.503906 16.503906 L 16.503906 15.503906 L 15.503906 15.503906 L 15.503906 14.503906 L 14.503906 14.503906 L 14.503906 13.501953 L 11.501953 13.501953 L 11.501953 14.503906 L 10.501953 14.503906 L 10.501953 15.503906 L 6.5019531 15.503906 L 6.5019531 16.503906 L 5.5 16.503906 L 5.5 18.503906 L 4.5 18.503906 L 4.5 20.503906 L 3.5 20.503906 L 3.5 21.503906 L 19.503906 21.503906 L 19.503906 20.503906 z M 3.5 20.503906 L 3.5 18.503906 L 2.5 18.503906 L 2.5 20.503906 L 3.5 20.503906 z M 2.5 20.503906 L 1.5 20.503906 L 1.5 22.503906 L 2.5 22.503906 L 2.5 20.503906 z M 3.5 18.503906 L 4.5 18.503906 L 4.5 16.503906 L 3.5 16.503906 L 3.5 18.503906 z M 4.5 16.503906 L 5.5 16.503906 L 5.5 15.503906 L 6.5019531 15.503906 L 6.5019531 14.503906 L 7.5019531 14.503906 L 7.5019531 13.501953 L 6.5019531 13.501953 L 6.5019531 14.501953 L 5.5 14.501953 L 5.5 15.501953 L 4.5 15.501953 L 4.5 16.503906 z M 7.5019531 13.501953 L 8.5019531 13.501953 L 8.5019531 12.501953 L 7.5019531 12.501953 L 7.5019531 13.501953 z M 8.5019531 12.501953 L 9.5019531 12.501953 L 9.5019531 3.5 L 8.5019531 3.5 L 8.5019531 12.501953 z M 8.5019531 3.5 L 8.5019531 2.5 L 7.5019531 2.5 L 7.5019531 3.5 L 8.5019531 3.5 z M 11.501953 16.503906 L 12.501953 16.503906 L 12.501953 17.503906 L 11.501953 17.503906 L 11.501953 16.503906 z M 7.5019531 17.503906 L 9.5019531 17.503906 L 9.5019531 19.503906 L 7.5019531 19.503906 L 7.5019531 17.503906 z M 2.5 22.505859 L 2.5 23.505859 L 20.503906 23.505859 L 20.503906 22.505859 L 2.5 22.505859 z',
		transform: 'translate(2 2) scale(0.25)',
	},
	downloads:
		'M5.55 6.794h.432v-.216h.433v-.216h.216v-.217h.217v-.433h.216V5.28h.217V3.981h-.217v-.433h-.216v-.433h-.217V2.9h-.216v-.217h-.433v-.216h-.433V2.25h-1.298v.216h-.433v.216h-.433V2.9h-.216v.216h-.217v.433h-.216v.433h-.217v1.298h.217v.433h.216v.433h.217v.217h.216v.216h.433v.216h.433v.217h1.298zm-1.083-1.298v-.217h-.216v-.216h-.217v-.216h-.216V4.63h.866V3.332h.432V4.63h.866v.217h-.216v.216h-.217v.216h-.216v.217h-.217v.216h-.432v-.216z',
	seed: {
		d: 'M 18 2 L 18 3 L 16 3 L 16 4 L 14 4 L 14 5 L 13 5 L 13 6 L 12 6 L 12 8 L 13 8 L 13 10 L 14 10 L 14 12 L 16 12 L 16 11 L 18 11 L 18 10 L 20 10 L 20 9 L 21 9 L 21 8 L 22 8 L 22 6 L 23 6 L 23 2 L 18 2 z M 1 5 L 1 8 L 2 8 L 2 10 L 3 10 L 3 12 L 4 12 L 4 13 L 5 13 L 5 14 L 7 14 L 7 15 L 11 15 L 11 22 L 13 22 L 13 11 L 12 11 L 12 9 L 11 9 L 11 8 L 10 8 L 10 7 L 8 7 L 8 6 L 6 6 L 6 5 L 1 5 z',
		transform: 'translate(2 2) scale(0.25)',
	},
	crown: {
		d: 'M23 7v2h-1v1h-1v4h-1v3h-1v2h-1v2H6v-2H5v-2H4v-3H3v-4H2V9H1V7h1V6h2v1h1v2H4v1h1v1h1v1h2v-1h1V9h1V7h1V6h-1V4h1V3h2v1h1v2h-1v1h1v2h1v2h1v1h2v-1h1v-1h1V9h-1V7h1V6h2v1z',
		transform: 'translate(2 2) scale(0.25)',
	},
}

const BADGE_FILES = {
	mako: '../img/badge_mako.svg',
	txori: '../img/badge_txori.svg',
	tui: '../img/badge_tui.svg',
}

function formatNum(n) {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
	return String(n)
}

function buildBadgeSvg({ name, tag, stars, issues, downloads }) {
	const COLORS = {
		green: '#b4d89c',
		blue: '#8aadf4',
		yellow: '#e5c890',
		orange: '#e3ac86',
		mauve: '#ca9ee6',
		surface0: '#363a4f',
	}

	const badges = [
		{ label: name, color: COLORS.green, icon: ICONS.seed },
		{ label: formatNum(stars), color: COLORS.yellow, icon: ICONS.stars },
		{ label: formatNum(issues), color: COLORS.orange, icon: ICONS.science },
		{ label: formatNum(downloads), color: COLORS.mauve, icon: ICONS.downloads },
		{ label: tag, color: COLORS.blue, icon: ICONS.crown },
	]

	const base = 10
	const block = { width: base, height: base }
	const text = { width: base * 3, height: base }
	const svg = {
		width: (text.width + block.width) * badges.length,
		height: block.height,
	}

	const sections = badges
		.map((badge, i) => {
			const text_x = i * (text.width + block.width)
			const text_center_x = block.width + text.width / 2
			const text_center_y = text.height / 2

			const textPath = textToPath(badge.label, text_center_x, text_center_y)

			const iconPath =
				typeof badge.icon === 'string' ? badge.icon : badge.icon.d

			const iconTransform =
				typeof badge.icon === 'string' ? '' : badge.icon.transform || ''

			return `
	<g class="badge" transform="translate(${text_x} 0)">
		<path transform="${iconTransform || ''}" fill="${badge.color}" d="${iconPath}"/>
		<rect fill="${badge.color}" width="${text.width}" height="${text.height}" x="${block.width}" y="0"/>
		${textPath ? `<path fill="${COLORS.surface0}" d="${textPath}"/>` : ''}
	</g>`
		})
		.join('')

	return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" viewBox="0 0 ${svg.width} ${svg.height}">
	<g>
		<rect width="${svg.width}" height="${svg.height}" fill="${COLORS.surface0}"/>
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
			console.error(`✗ badge: ${result.reason.message}`)
			continue
		}

		const [key, stats] = result.value
		const outFile = resolve(__dirname, BADGE_FILES[key])
		writeFileSync(outFile, buildBadgeSvg(stats), 'utf8')
		console.log(`✓ ${BADGE_FILES[key]}`)
	}
}
