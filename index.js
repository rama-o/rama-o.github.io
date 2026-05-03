// @ts-check
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Each page maps to a GitHub repo and an HTML file.
 * @type {Array<{ file: string, repo: string }>}
 */
const PAGES = [
	{ file: 'mako.html', repo: 'rama-io/mako' },
	{ file: 'txori.html', repo: 'rama-io/txori' },
	{ file: 'tui.html', repo: 'rama-io/tui' },
]

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

/**
 * Fetch all pages of a GitHub REST endpoint, following Link: next headers.
 * Handles 202 Accepted (GitHub computes contributor stats lazily).
 *
 * @param {string} url
 * @returns {Promise<any[]>}
 */
async function fetchAllPages(url) {
	const results = []
	let next = url

	while (next) {
		let res
		for (let attempt = 0; attempt < 5; attempt++) {
			res = await fetch(next, {
				headers: { Accept: 'application/vnd.github+json' },
			})
			if (res.status !== 202) break
			const wait = (attempt + 1) * 3000
			console.warn(
				`  ↻ GitHub is building stats (202), retrying in ${wait / 1000}s…`
			)
			await new Promise(r => setTimeout(r, wait))
		}

		const remaining = res.headers.get('x-ratelimit-remaining')
		const resetAt = res.headers.get('x-ratelimit-reset')
		if (remaining !== null && Number(remaining) < 10) {
			const resetDate = new Date(Number(resetAt) * 1000).toLocaleTimeString()
			console.warn(
				`  ⚠ Rate limit low: ${remaining} requests left, resets at ${resetDate}`
			)
		}

		if (!res.ok) throw new Error(`GitHub API ${res.status}: ${next}`)

		const page = await res.json()
		results.push(...page)

		const link = res.headers.get('link') ?? ''
		const match = link.match(/<([^>]+)>;\s*rel="next"/)
		next = match ? match[1] : null
	}

	return results
}

/**
 * Fetch the latest release for a repo.
 * @param {string} repo  e.g. "rama-io/mako"
 * @returns {Promise<{ tag: string, apkUrl: string | null, htmlUrl: string }>}
 */
async function getLatestRelease(repo) {
	const res = await fetch(
		`https://api.github.com/repos/${repo}/releases/latest`,
		{ headers: { Accept: 'application/vnd.github+json' } }
	)
	if (!res.ok) throw new Error(`[${repo}] releases API ${res.status}`)
	const data = await res.json()
	const apk = data.assets?.find(a => a.name.endsWith('.apk'))
	return {
		tag: data.tag_name,
		apkUrl: apk?.browser_download_url ?? null,
		htmlUrl: data.html_url,
	}
}

/**
 * Fetch ALL contributors for a repo by combining:
 *   1. /contributors    — direct committers (primary source)
 *   2. /pulls?state=all — PR authors whose commits were squash-merged
 *
 * Deduped by login, bots filtered out, committers listed first.
 *
 * @param {string} repo  e.g. "rama-io/mako"
 * @returns {Promise<Array<{ login: string, avatarUrl: string, htmlUrl: string }>>}
 */
async function getContributors(repo) {
	const base = `https://api.github.com/repos/${repo}`

	const committers = await fetchAllPages(`${base}/contributors?per_page=100`)
	const prs = await fetchAllPages(`${base}/pulls?state=all&per_page=100`)

	console.log(
		`  ℹ raw counts — committers: ${committers.length}, PRs: ${prs.length}`
	)

	/** @type {Map<string, { login: string, avatarUrl: string, htmlUrl: string }>} */
	const seen = new Map()

	/** @param {{ login?: string, id?: number, html_url?: string } | null | undefined} user */
	const add = user => {
		if (!user?.login) return
		if (user.login.endsWith('[bot]')) return
		if (seen.has(user.login)) return
		seen.set(user.login, {
			login: user.login,
			avatarUrl: `https://avatars.githubusercontent.com/u/${user.id}?s=45`,
			htmlUrl: user.html_url,
		})
	}

	for (const c of committers) add(c)
	for (const pr of prs) add(pr.user)

	return [...seen.values()]
}

/**
 * Fetch and parse changelog.md from the repo's master branch.
 *
 * Expects standard markdown with version headings like:
 *   ## 2026.35
 *   ### Added
 *   - thing
 *   ### Fixed
 *   - other thing
 *
 *   ## 2026.30
 *   - flat list item
 *
 * Returns an array of version blocks, newest first (preserves file order).
 *
 * @param {string} repo  e.g. "rama-io/mako"
 * @returns {Promise<Array<{ version: string, sections: Array<{ heading: string | null, items: string[] }> }>>}
 */
async function getChangelog(repo) {
	const url = `https://raw.githubusercontent.com/${repo}/master/changelog.md`
	const res = await fetch(url)
	if (!res.ok)
		throw new Error(`[${repo}] changelog fetch ${res.status}: ${url}`)
	const md = await res.text()

	/** @type {Array<{ version: string, sections: Array<{ heading: string | null, items: string[] }> }>} */
	const versions = []
	let currentVersion = null
	let currentHeading = null
	let currentItems = []
	let currentSections = []

	const flushSection = () => {
		if (currentItems.length > 0) {
			currentSections.push({
				heading: currentHeading,
				items: [...currentItems],
			})
			currentItems = []
			currentHeading = null
		}
	}

	const flushVersion = () => {
		if (currentVersion !== null) {
			flushSection()
			if (currentSections.length > 0) {
				versions.push({
					version: currentVersion,
					sections: [...currentSections],
				})
			}
			currentSections = []
		}
	}

	for (const rawLine of md.split('\n')) {
		const line = rawLine.trim()

		// Top-level heading = version  (## 2026.35  or  ## v36  or  # Changelog etc)
		if (/^#{1,2}\s/.test(line)) {
			const heading = line.replace(/^#+\s*/, '').trim()
			// Skip a top-level "Changelog" title that isn't a version
			if (/changelog/i.test(heading) && !/\d/.test(heading)) continue
			flushVersion()
			currentVersion = heading
			continue
		}

		// Sub-heading inside a version  (### Added / ### Fixed / etc)
		if (/^#{3,}\s/.test(line)) {
			flushSection()
			currentHeading = line.replace(/^#+\s*/, '').trim()
			continue
		}

		// List item  (- item  or  * item)
		if (/^[-*]\s/.test(line)) {
			currentItems.push(line.replace(/^[-*]\s*/, '').trim())
			continue
		}
	}

	flushVersion()
	return versions
}

// ---------------------------------------------------------------------------
// HTML patch helpers
// ---------------------------------------------------------------------------

/**
 * Replace the href and label of the CTA nn-btn download button.
 *
 * @param {string} html
 * @param {{ tag: string, apkUrl: string | null, htmlUrl: string }} release
 * @returns {string}
 */
function patchRelease(html, release) {
	const href = release.apkUrl ?? release.htmlUrl
	const label = `Get the latest (${release.tag}) from GitHub`

	return html.replace(
		/([\t ]*<nn-btn\s[\s\S]*?href=")[^"]*("[\s\S]*?>)([\s\S]*?)(<\/nn-btn[\s\S]*?>)/,
		(_, open, mid, _oldLabel, close) => `${open}${href}${mid}${label}${close}`
	)
}

/**
 * Replace the entire <ul class="avatars"> block with live contributor avatars.
 *
 * @param {string} html
 * @param {Array<{ login: string, avatarUrl: string, htmlUrl: string }>} contributors
 * @returns {string}
 */
function patchContributors(html, contributors) {
	const items = contributors
		.map(
			c =>
				`\t\t\t\t\t<li>\n` +
				`\t\t\t\t\t\t<a href="${c.htmlUrl}" target="_blank" rel="noopener noreferrer">\n` +
				`\t\t\t\t\t\t\t<img\n` +
				`\t\t\t\t\t\t\t\tsrc="${c.avatarUrl}"\n` +
				`\t\t\t\t\t\t\t\ttitle="${c.login}"\n` +
				`\t\t\t\t\t\t\t\talt="${c.login}'s avatar"\n` +
				`\t\t\t\t\t\t\t/>\n` +
				`\t\t\t\t\t\t</a>\n` +
				`\t\t\t\t\t</li>`
		)
		.join('\n')

	return html.replace(
		/<ul class="avatars">[\s\S]*?<\/ul>/,
		`<ul class="avatars">\n${items}\n\t\t\t\t</ul>`
	)
}

/**
 * Replace everything between <h2>Changelog</h2> and the next <h2> (or </nn-caja>)
 * with freshly generated <section> blocks from the parsed changelog.
 *
 * Each version becomes:
 *   <section>
 *     <h3>2026.35</h3>          ← version heading
 *     <h4>Added</h4>            ← sub-heading (omitted if none)
 *     <ul><li>…</li></ul>
 *   </section>
 *
 * @param {string} html
 * @param {Array<{ version: string, sections: Array<{ heading: string | null, items: string[] }> }>} versions
 * @returns {string}
 */
function patchChangelog(html, versions) {
	const t = '\t\t\t\t' // base indent inside <nn-caja>

	const sectionsHtml = versions
		.map(({ version, sections }) => {
			const innerLines = sections.flatMap(({ heading, items }) => {
				const lines = []
				if (heading) lines.push(`${t}\t<h4>${escapeHtml(heading)}</h4>`)
				lines.push(`${t}\t<ul>`)
				for (const item of items)
					lines.push(`${t}\t\t<li>${escapeHtml(item)}</li>`)
				lines.push(`${t}\t</ul>`)
				return lines
			})

			return [
				`${t}<section>`,
				`${t}\t<h3>${escapeHtml(version)}</h3>`,
				...innerLines,
				`${t}</section>`,
			].join('\n')
		})
		.join('\n')

	// Replace everything between <h2>Changelog</h2> and the closing </nn-caja>
	// of that same block (the one that contains the changelog sections).

	return html.replace(
		/(<h2>Changelog<\/h2>\s*)[\s\S]*?(<\/nn-caja>)/,
		(_, start, end) => `${start.trimEnd()}\n${sectionsHtml}\n\t\t\t${end}`
	)
}

/** Escape minimal HTML special chars for text content. */
function escapeHtml(str) {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	for (const { file, repo } of PAGES) {
		const filePath = resolve(__dirname, file)
		let html = readFileSync(filePath, 'utf8')

		console.log(`\n📄 ${file}  →  ${repo}`)

		const [releaseResult, contributorsResult, changelogResult] =
			await Promise.allSettled([
				getLatestRelease(repo),
				getContributors(repo),
				getChangelog(repo),
			])

		if (releaseResult.status === 'fulfilled') {
			html = patchRelease(html, releaseResult.value)
			console.log(`  ✓ release        ${releaseResult.value.tag}`)
		} else {
			console.warn(`  ✗ release        ${releaseResult.reason.message}`)
		}

		if (contributorsResult.status === 'fulfilled') {
			html = patchContributors(html, contributorsResult.value)
			console.log(
				`  ✓ contributors   ${contributorsResult.value.map(c => c.login).join(', ')}`
			)
		} else {
			console.warn(`  ✗ contributors   ${contributorsResult.reason.message}`)
		}

		if (changelogResult.status === 'fulfilled') {
			html = patchChangelog(html, changelogResult.value)
			console.log(
				`  ✓ changelog      ${changelogResult.value.length} version(s)`
			)
		} else {
			console.warn(`  ✗ changelog      ${changelogResult.reason.message}`)
		}

		writeFileSync(filePath, html, 'utf8')
	}

	console.log('\n✅ Done — HTML files updated.\n')
}

main().catch(err => {
	console.error(err)
	process.exit(1)
})
