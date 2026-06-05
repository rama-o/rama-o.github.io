import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { REPOS, DEV, getLatestRelease } from './scripts/github.mjs'
import { generateBadges } from './scripts/gen_badge.mjs'
import { patchAllHtml } from './patch_html.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
	if (DEV) console.log('⚠  DEV mode — all GitHub API calls are skipped\n')

	// ------------------------------------------------------------------
	// 1. Fetch releases once — shared by both badges and HTML patching
	// ------------------------------------------------------------------

	console.log('Fetching latest releases…\n')

	const releaseResults = await Promise.allSettled(
		Object.entries(REPOS).map(async ([key, repo]) => {
			const release = await getLatestRelease(repo)
			console.log(`  ✓ ${key} ${release.tag}`)
			return [key, release]
		})
	)

	const releases = {}
	for (const result of releaseResults) {
		if (result.status === 'fulfilled') {
			const [key, release] = result.value
			releases[key] = release
		} else {
			console.error(`  ✗ ${result.reason.message}`)
		}
	}

	// ------------------------------------------------------------------
	// 2. Fan out — badges and HTML can run concurrently
	// ------------------------------------------------------------------

	console.log('\n Generating badges…\n')
	await generateBadges(REPOS, releases)

	console.log('\n Patching HTML…\n')
	await patchAllHtml(__dirname, REPOS, releases)

	console.log('\n Done\n')
}

main().catch(err => {
	console.error(err)
	process.exit(1)
})
