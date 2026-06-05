// ---------------------------------------------------------------------------
// Shared GitHub client
// ---------------------------------------------------------------------------

// Set to true to skip all network calls and return mock data instead.
export const DEV = false

// ---------------------------------------------------------------------------
// Mock data (used when DEV = true)
// ---------------------------------------------------------------------------

const MOCK_RELEASE = repo => ({
	tag: 'v0.0.0-dev',
	htmlUrl: `https://github.com/${repo}/releases`,
	apkUrl: `https://github.com/${repo}/releases`,
})

const MOCK_CONTRIBUTORS = () => [
	{ login: 'dev-user', avatarUrl: 'https://avatars.githubusercontent.com/u/0?s=45', htmlUrl: 'https://github.com' },
]

const MOCK_CHANGELOG = () => [
	{ version: '0.0.0-dev', items: ['Dev mode — no network calls made'] },
]

const MOCK_REPO_STATS = repo => ({
	name: repo.split('/')[1].toUpperCase(),
	tag: '0.0.0-dev',
	stars: 0,
	issues: 0,
	downloads: 0,
})

export const REPOS = {
	mako: 'rama-io/mako',
	txori: 'rama-io/txori',
	tui: 'rama-io/tui',
}

export const HEADERS = {
	Accept: 'application/vnd.github+json',
	'User-Agent': 'rama-build-script',
	...(process.env.GITHUB_TOKEN
		? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
		: {}),
}

export async function ghFetch(url) {
	if (DEV) return {}
	const res = await fetch(url, { headers: HEADERS })
	if (!res.ok) throw new Error(`GitHub API ${res.status} for ${url}`)
	return res.json()
}

export async function fetchAllPages(url) {
	if (DEV) return []
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

// { tag, htmlUrl, apkUrl }
export async function getLatestRelease(repo) {
	if (DEV) return MOCK_RELEASE(repo)
	const data = await ghFetch(
		`https://api.github.com/repos/${repo}/releases/latest`
	)
	const apk = data.assets.find(a => a.name.endsWith('.apk'))

	return {
		tag: data.tag_name,
		htmlUrl: data.html_url,
		apkUrl: apk?.browser_download_url ?? data.html_url,
	}
}

// [{ login, avatarUrl, htmlUrl }]
export async function getContributors(repo) {
	if (DEV) return MOCK_CONTRIBUTORS()
	const base = `https://api.github.com/repos/${repo}`

	const [committers, prs] = await Promise.all([
		fetchAllPages(`${base}/contributors?per_page=100`),
		fetchAllPages(`${base}/pulls?state=all&per_page=100`),
	])

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

// [{ version, items[] }]
export async function getChangelog(repo) {
	if (DEV) return MOCK_CHANGELOG()
	const res = await fetch(
		`https://raw.githubusercontent.com/${repo}/master/changelog.md`
	)
	if (!res.ok) throw new Error(`[${repo}] changelog ${res.status}`)

	const versions = []
	let current = null
	let items = []

	const flush = () => {
		if (current && items.length)
			versions.push({ version: current, items: [...items] })
		items = []
	}

	for (const line of (await res.text()).split('\n')) {
		const l = line.trim()

		if (/^#{1,2}\s/.test(l)) {
			const heading = l.replace(/^#+\s*/, '')
			if (!/\d/.test(heading)) continue
			flush()
			current = heading
			continue
		}

		if (/^[-*]\s/.test(l)) items.push(l.replace(/^[-*]\s*/, ''))
	}

	flush()
	return versions
}

// { name, tag, stars, issues, downloads }
export async function getRepoStats(repo) {
	if (DEV) return MOCK_REPO_STATS(repo)
	const base = `https://api.github.com/repos/${repo}`

	const [repoData, latestRelease] = await Promise.all([
		ghFetch(base),
		ghFetch(`${base}/releases/latest`).catch(() => null),
	])

	let downloads = 0
	try {
		const releases = await fetchAllPages(`${base}/releases?per_page=100`)
		for (const rel of releases)
			for (const asset of rel.assets) downloads += asset.download_count
	} catch (e) {
		console.warn(`downloads unavailable for ${repo}: ${e.message}`)
	}

	return {
		name: repo.split('/')[1].toUpperCase(),
		tag: latestRelease?.tag_name?.replace(/^v/, '') ?? '—',
		stars: repoData.stargazers_count ?? 0,
		issues: repoData.open_issues_count ?? 0,
		downloads,
	}
}
