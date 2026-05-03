// @ts-check
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * @type {Array<{ file: string, repo?: string, index?: boolean }>}
 */
const PAGES = [
	{ file: 'mako.html', repo: 'rama-io/mako' },
	{ file: 'txori.html', repo: 'rama-io/txori' },
	{ file: 'tui.html', repo: 'rama-io/tui' },
	{ file: 'index.html', index: true },
]

const REPOS = {
	mako: 'rama-io/mako',
	txori: 'rama-io/txori',
	tui: 'rama-io/tui',
}

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

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
			await new Promise(r => setTimeout(r, wait))
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

async function getContributors(repo) {
	const base = `https://api.github.com/repos/${repo}`

	const committers = await fetchAllPages(`${base}/contributors?per_page=100`)
	const prs = await fetchAllPages(`${base}/pulls?state=all&per_page=100`)

	/** @type {Map<string, { login: string, avatarUrl: string, htmlUrl: string }>} */
	const seen = new Map()

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

async function getChangelog(repo) {
	const url = `https://raw.githubusercontent.com/${repo}/master/changelog.md`
	const res = await fetch(url)
	if (!res.ok) throw new Error(`[${repo}] changelog fetch ${res.status}`)

	const md = await res.text()

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

		if (/^#{1,2}\s/.test(line)) {
			const heading = line.replace(/^#+\s*/, '').trim()
			if (/changelog/i.test(heading) && !/\d/.test(heading)) continue
			flushVersion()
			currentVersion = heading
			continue
		}

		if (/^#{3,}\s/.test(line)) {
			flushSection()
			currentHeading = line.replace(/^#+\s*/, '').trim()
			continue
		}

		if (/^[-*]\s/.test(line)) {
			currentItems.push(line.replace(/^[-*]\s*/, '').trim())
		}
	}

	flushVersion()
	return versions
}

// ---------------------------------------------------------------------------
// HTML patch helpers
// ---------------------------------------------------------------------------

function formatName(name) {
	return name.charAt(0).toUpperCase() + name.slice(1)
}

function patchRelease(html, release, appName) {
	const href = release.apkUrl ?? release.htmlUrl
	const label = `Download ${formatName(appName)} ${release.tag}`

	return html.replace(
		/<a([^>]*\bdownload\b[^>]*)>([\s\S]*?)<\/a>/,
		(match, attrs) => {
			// safely replace or add href
			let newAttrs
			if (/href="/.test(attrs)) {
				newAttrs = attrs.replace(/href="[^"]*"/, `href="${href}"`)
			} else {
				newAttrs = `${attrs} href="${href}"`
			}

			return `<a${newAttrs}>${label}</a>`
		}
	)
}

function patchIndexButtons(html, releases) {
	return html.replace(
		/<a([^>]*data-app="([^"]+)"[^>]*)>([\s\S]*?)<\/a>/g,
		(match, attrs, app) => {
			const key = app.toLowerCase()
			const release = releases[key]
			if (!release) return match

			const href = release.apkUrl ?? release.htmlUrl
			const label = `Download ${formatName(key)} ${release.tag}`

			// Replace or inject href safely
			let newAttrs
			if (/href="/.test(attrs)) {
				newAttrs = attrs.replace(/href="[^"]*"/, `href="${href}"`)
			} else {
				newAttrs = `${attrs} href="${href}"`
			}

			return `<a${newAttrs}>${label}</a>`
		}
	)
}

function patchContributors(html, contributors) {
	const items = contributors
		.map(
			c =>
				`\t\t\t\t\t<li>\n` +
				`\t\t\t\t\t\t<a href="${c.htmlUrl}" target="_blank">\n` +
				`\t\t\t\t\t\t\t<img src="${c.avatarUrl}" title="${c.login}" />\n` +
				`\t\t\t\t\t\t</a>\n` +
				`\t\t\t\t\t</li>`
		)
		.join('\n')

	return html.replace(
		/<ul class="avatars">[\s\S]*?<\/ul>/,
		`<ul class="avatars">\n${items}\n\t\t\t\t</ul>`
	)
}

function patchChangelog(html, versions) {
	const t = '\t\t\t\t'

	const sectionsHtml = versions
		.map(({ version, sections }) => {
			const inner = sections.flatMap(({ heading, items }) => {
				const lines = []
				if (heading) lines.push(`${t}\t<h4>${heading}</h4>`)
				lines.push(`${t}\t<ul>`)
				items.forEach(i => lines.push(`${t}\t\t<li>${i}</li>`))
				lines.push(`${t}\t</ul>`)
				return lines
			})

			return [
				`${t}<section>`,
				`${t}\t<h3>${version}</h3>`,
				...inner,
				`${t}</section>`,
			].join('\n')
		})
		.join('\n')

	return html.replace(
		/(<h2>Changelog<\/h2>\s*)[\s\S]*?(<\/nn-caja>)/,
		(_, start, end) => `${start.trimEnd()}\n${sectionsHtml}\n\t\t\t${end}`
	)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	const entries = Object.entries(REPOS)

	const results = await Promise.allSettled(
		entries.map(([, repo]) => getLatestRelease(repo))
	)

	const releases = {}

	results.forEach((res, i) => {
		const key = entries[i][0]
		if (res.status === 'fulfilled') {
			releases[key] = res.value
			console.log(`✓ ${key} ${res.value.tag}`)
		}
	})

	for (const page of PAGES) {
		const filePath = resolve(__dirname, page.file)
		let html = readFileSync(filePath, 'utf8')

		console.log(`\n📄 ${page.file}`)

		if (page.index) {
			html = patchIndexButtons(html, releases)
			writeFileSync(filePath, html)
			continue
		}

		const repo = page.repo
		const app = Object.keys(REPOS).find(k => REPOS[k] === repo)

		html = patchRelease(html, releases[app], app)

		const [contributors, changelog] = await Promise.all([
			getContributors(repo),
			getChangelog(repo),
		])

		html = patchContributors(html, contributors)
		html = patchChangelog(html, changelog)

		writeFileSync(filePath, html)
	}

	console.log('\n✅ Done\n')
}

main().catch(err => {
	console.error(err)
	process.exit(1)
})
