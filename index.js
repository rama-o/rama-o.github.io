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
 * Fetch the latest release for a repo.
 * @param {string} repo  e.g. "rama-io/mako"
 * @returns {Promise<{ tag: string, apkUrl: string | null, htmlUrl: string }>}
 */
async function getLatestRelease(repo) {
	const res = await fetch(
		`https://api.github.com/repos/${repo}/releases/latest`,
		{ headers: { Accept: 'application/vnd.github+json' } },
	)
	if (!res.ok) throw new Error(`[${repo}] releases API ${res.status}`)
	const data = await res.json()
	const apk = data.assets?.find((a) => a.name.endsWith('.apk'))
	return {
		tag: data.tag_name,
		apkUrl: apk?.browser_download_url ?? null,
		htmlUrl: data.html_url,
	}
}

/**
 * Fetch all contributors for a repo.
 * @param {string} repo  e.g. "rama-io/mako"
 * @returns {Promise<Array<{ login: string, avatarUrl: string, htmlUrl: string }>>}
 */
async function getContributors(repo) {
	const res = await fetch(
		`https://api.github.com/repos/${repo}/contributors?per_page=100`,
		{ headers: { Accept: 'application/vnd.github+json' } },
	)
	if (!res.ok) throw new Error(`[${repo}] contributors API ${res.status}`)
	const data = await res.json()
	return data.map((c) => ({
		login: c.login,
		avatarUrl: `https://avatars.githubusercontent.com/u/${c.id}?s=45`,
		htmlUrl: c.html_url,
	}))
}

// ---------------------------------------------------------------------------
// HTML patch helpers
// ---------------------------------------------------------------------------

/**
 * Replace the href and label of the CTA nn-btn download button.
 *
 * The nn-btn in these files uses a non-standard closing tag style:
 *   <nn-btn
 *     href="…"
 *     …
 *     >Label text</nn-btn
 *   >
 *
 * @param {string} html
 * @param {{ tag: string, apkUrl: string | null, htmlUrl: string }} release
 * @returns {string}
 */
function patchRelease(html, release) {
	const href = release.apkUrl ?? release.htmlUrl
	const label = `Get the latest (${release.tag}) from GitHub`

	// Match the nn-btn opening tag (with href attr on its own line),
	// capture the label text, and the closing </nn-btn\n\t...>
	return html.replace(
		/([\t ]*<nn-btn\s[\s\S]*?href=")[^"]*("[\s\S]*?>)([\s\S]*?)(<\/nn-btn[\s\S]*?>)/,
		(_, open, mid, _oldLabel, close) =>
			`${open}${href}${mid}${label}${close}`,
	)
}

/**
 * Replace the entire <ul class="avatars"> block with fresh contributor avatars.
 *
 * @param {string} html
 * @param {Array<{ login: string, avatarUrl: string, htmlUrl: string }>} contributors
 * @returns {string}
 */
function patchContributors(html, contributors) {
	const items = contributors
		.map(
			(c) =>
				`\t\t\t\t\t<li>\n` +
				`\t\t\t\t\t\t<a href="${c.htmlUrl}" target="_blank" rel="noopener noreferrer">\n` +
				`\t\t\t\t\t\t\t<img\n` +
				`\t\t\t\t\t\t\t\tsrc="${c.avatarUrl}"\n` +
				`\t\t\t\t\t\t\t\ttitle="${c.login}"\n` +
				`\t\t\t\t\t\t\t\talt="${c.login}'s avatar"\n` +
				`\t\t\t\t\t\t\t/>\n` +
				`\t\t\t\t\t\t</a>\n` +
				`\t\t\t\t\t</li>`,
		)
		.join('\n')

	return html.replace(
		/<ul class="avatars">[\s\S]*?<\/ul>/,
		`<ul class="avatars">\n${items}\n\t\t\t\t</ul>`,
	)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	for (const { file, repo } of PAGES) {
		const filePath = resolve(__dirname, file)
		let html = readFileSync(filePath, 'utf8')

		console.log(`\n📄 ${file}  →  ${repo}`)

		const [releaseResult, contributorsResult] = await Promise.allSettled([
			getLatestRelease(repo),
			getContributors(repo),
		])

		if (releaseResult.status === 'fulfilled') {
			html = patchRelease(html, releaseResult.value)
			console.log(`  ✓ release        ${releaseResult.value.tag}`)
		} else {
			console.warn(`  ✗ release        ${releaseResult.reason.message}`)
		}

		if (contributorsResult.status === 'fulfilled') {
			html = patchContributors(html, contributorsResult.value)
			console.log(`  ✓ contributors   ${contributorsResult.value.map((c) => c.login).join(', ')}`)
		} else {
			console.warn(`  ✗ contributors   ${contributorsResult.reason.message}`)
		}

		writeFileSync(filePath, html, 'utf8')
	}

	console.log('\n✅ Done — HTML files updated.\n')
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})