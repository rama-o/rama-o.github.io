import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

const HEADERS = {
	Accept: 'application/vnd.github+json',
	'User-Agent': 'rama-build-script',
}

const PAGES = [
	{ file: 'mako.html', app: 'mako' },
	{ file: 'txori.html', app: 'txori' },
	{ file: 'tui.html', app: 'tui' },
	{ file: 'index.html', index: true },
]

const REPOS = {
	mako: 'rama-io/mako',
	txori: 'rama-io/txori',
	tui: 'rama-io/tui',
}

// ---------------------------------------------------------------------------
// GitHub helpers
// ---------------------------------------------------------------------------

async function fetchAllPages(url) {
	const results = []
	let next = url

	while (next) {
		const res = await fetch(next, { headers: HEADERS })
		if (!res.ok) throw new Error(`GitHub API ${res.status}`)

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
		{ headers: HEADERS }
	)

	if (!res.ok) {
		throw new Error(`[${repo}] release ${res.status}`)
	}

	const data = await res.json()

	const apk = data.assets.find(asset => asset.name.endsWith('.apk'))

	return {
		tag: data.tag_name,
		htmlUrl: data.html_url,
		apkUrl: apk?.browser_download_url ?? data.html_url,
	}
}

async function getContributors(repo) {
	const base = `https://api.github.com/repos/${repo}`

	const committers = await fetchAllPages(`${base}/contributors?per_page=100`)
	const prs = await fetchAllPages(`${base}/pulls?state=all&per_page=100`)

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

	committers.forEach(add)
	prs.forEach(pr => add(pr.user))

	return [...seen.values()]
}

async function getChangelog(repo) {
	const res = await fetch(
		`https://raw.githubusercontent.com/${repo}/master/changelog.md`
	)

	if (!res.ok) throw new Error(`[${repo}] changelog ${res.status}`)

	const md = await res.text()

	const versions = []
	let currentVersion = null
	let currentItems = []

	const flush = () => {
		if (currentVersion && currentItems.length) {
			versions.push({
				version: currentVersion,
				items: [...currentItems],
			})
		}
		currentItems = []
	}

	for (const line of md.split('\n')) {
		const l = line.trim()

		if (/^#{1,2}\s/.test(l)) {
			const heading = l.replace(/^#+\s*/, '')
			if (!/\d/.test(heading)) continue
			flush()
			currentVersion = heading
			continue
		}

		if (/^[-*]\s/.test(l)) {
			currentItems.push(l.replace(/^[-*]\s*/, ''))
		}
	}

	flush()
	return versions
}

// ---------------------------------------------------------------------------
// HTML patching
// ---------------------------------------------------------------------------

function formatName(name) {
	return name.charAt(0).toUpperCase() + name.slice(1)
}

function patchRelease(html, release, app) {
	const version = release.tag.replace(/^v/, '')
	const href = release.apkUrl
	const label = `Download ${formatName(app)} ${version}`

	return html.replace(
		/<a([^>]*\bdownload\b[^>]*)>([\s\S]*?)<\/a>/,
		(_, attrs) => {
			const newAttrs = /href=/.test(attrs)
				? attrs.replace(/href="[^"]*"/, `href="${href}"`)
				: `${attrs} href="${href}"`

			return `<a${newAttrs}>${label}</a>`
		}
	)
}

function patchIndexButtons(html, releases) {
	return html.replace(
		/<a([^>]*data-app="([^"]+)"[^>]*)>([\s\S]*?)<\/a>/g,
		(_, attrs, app) => {
			const release = releases[app.toLowerCase()]
			if (!release) return _

			const version = release.tag.replace(/^v/, '')
			const href = release.apkUrl
			const label = `Download ${formatName(app)} ${version}`

			const newAttrs = /href=/.test(attrs)
				? attrs.replace(/href="[^"]*"/, `href="${href}"`)
				: `${attrs} href="${href}"`

			return `<a${newAttrs}>${label}</a>`
		}
	)
}

function patchContributors(html, contributors) {
	const items = contributors
		.map(
			c => `
				<li>
					<a href="${c.htmlUrl}" target="_blank">
						<img src="${c.avatarUrl}" title="${c.login}" />
					</a>
				</li>`
		)
		.join('')

	return html.replace(
		/<ul class="avatars">[\s\S]*?<\/ul>/,
		`<ul class="avatars">${items}</ul>`
	)
}

function patchChangelog(html, versions) {
	const sections = versions
		.map(
			v => `<section>
				<h3>${v.version}</h3>
				<ul>
					${v.items.map(i => `<li>${i}</li>`).join('')}
				</ul>
			</section>`
		)
		.join('')

	return html.replace(
		/(<h2>Changelog<\/h2>\s*)[\s\S]*?(<\/nn-caja>)/,
		(_, start, end) => `${start.trimEnd()}\n${sections}\n${end}`
	)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	const releases = {}

	const entries = Object.entries(REPOS)

	const results = await Promise.allSettled(
		entries.map(([, repo]) => getLatestRelease(repo))
	)

	results.forEach((res, i) => {
		const key = entries[i][0]

		if (res.status === 'fulfilled') {
			releases[key] = res.value
			console.log(`✓ ${key} ${res.value.tag}`)
		} else {
			console.error(`✗ ${key}: ${res.reason.message}`)
		}
	})

	// Patch HTML
	for (const page of PAGES) {
		const filePath = resolve(__dirname, page.file)
		let html = readFileSync(filePath, 'utf8')

		console.log(`\n📄 ${page.file}`)

		if (page.index) {
			html = patchIndexButtons(html, releases)
			writeFileSync(filePath, html)
			continue
		}

		const app = page.app
		const repo = REPOS[app]
		const release = releases[app]

		if (!release) {
			console.warn(`  ⚠ no release for ${app}`)
			continue
		}

		html = patchRelease(html, release, app)

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
