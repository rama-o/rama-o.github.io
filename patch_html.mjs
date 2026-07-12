import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getContributors, getChangelog } from './scripts/github.mjs'

const PAGES = [
	{ file: 'mako.html', app: 'mako' },
	{ file: 'txori.html', app: 'txori' },
	{ file: 'tui.html', app: 'tui' },
	{ file: 'teyin.html', app: 'teyin' },
	{ file: 'okapi.html', app: 'okapi' },
	{ file: 'index.html', index: true },
]

// ---------------------------------------------------------------------------
// Patchers
// ---------------------------------------------------------------------------

function formatName(name) {
	return name.charAt(0).toUpperCase() + name.slice(1)
}

function patchRelease(html, release, app) {
	const version = release.tag.replace(/^v/, '')
	const label = `Download ${formatName(app)} ${version}`

	return html.replace(
		/<a([^>]*\bdownload\b[^>]*)>([\s\S]*?)<\/a>/,
		(_, attrs) => {
			const newAttrs = /href=/.test(attrs)
				? attrs.replace(/href="[^"]*"/, `href="${release.apkUrl}"`)
				: `${attrs} href="${release.apkUrl}"`
			return `<a${newAttrs}>${label}</a>`
		}
	)
}

function patchIndexButtons(html, releases) {
	return html.replace(
		/<a\b((?:[^>]|\n)*?)>([\s\S]*?)<\/a[\s]*>/g,
		(match, attrs) => {
			const appMatch = attrs.match(/data-app="([^"]+)"/)
			if (!appMatch) return match

			const app = appMatch[1]
			const release = releases[app]

			if (!release?.apkUrl) {
				console.warn(`  ⚠ no release found for ${app}`)
				return match
			}

			const version = release.tag.replace(/^v/, '')
			const label = `Download ${formatName(app)} ${version}`
			const newAttrs = attrs.replace(/href="[^"]*"/, `href="${release.apkUrl}"`)
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
// Public API — called by build.mjs with pre-fetched releases
// ---------------------------------------------------------------------------

export async function patchAllHtml(rootDir, repos, releases) {
	for (const page of PAGES) {
		const filePath = resolve(rootDir, page.file)
		let html = readFileSync(filePath, 'utf8')

		console.log(`  📄 ${page.file}`)

		if (page.index) {
			html = patchIndexButtons(html, releases)
			writeFileSync(filePath, html)
			continue
		}

		const app = page.app
		const release = releases[app]

		if (!release) {
			console.warn(`  ⚠ no release for ${app}, skipping`)
			continue
		}

		html = patchRelease(html, release, app)

		const [contributors, changelog] = await Promise.all([
			getContributors(repos[app]),
			getChangelog(repos[app]),
		])

		html = patchContributors(html, contributors)
		html = patchChangelog(html, changelog)

		writeFileSync(filePath, html)
	}
}
