import fs from 'fs/promises'
import path from 'path'
import { parse } from 'csv-parse/sync'

const OUTPUT_DIR = './output'

const SHEETS = [
	{
		name: 'mako',
		sheetId: '1IgC4wIgcyzeaUvZy_9hCtVu64Q9QLv3jy61WN-micyc',
		gid: '2038120130',
	},
	{
		name: 'bohio',
		sheetId: '1i5Z81sZgjLi_WRMcoqINt0I953GOMHKOnYcR3AqSHeU',
		gid: '901810272',
	},
]

const LANG_MAP = {
	en: 'values',
	de: 'values-de',
	fr: 'values-fr',
	'pt-BR': 'values-pt-rBR',
	'fil-PH': 'values-fil-rPH',
	tr: 'values-tr',
	fi: 'values-fi',
	'zh-rCN': 'values-zh-rCN',
}

function csvUrl(sheetId, gid) {
	return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`
}

function escapeXml(text) {
	return String(text ?? '')
		.replace(/&/g, '&amp;')
		.replace(/'/g, "\\'")
		.replace(/"/g, '\\"')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
}

function convertIcuToAndroid(str) {
  return String(str)
    // numbered values
    .replace(/\{(\d+),\s*number\}/g, (_, i) => `%${Number(i) + 1}$d`)

    // plain placeholders
    .replace(/\{(\d+)\}/g, (_, i) => `%${Number(i) + 1}$s`);
}

async function downloadCsv(url) {
	const res = await fetch(url)

	if (!res.ok) {
		throw new Error(`Failed downloading ${url}`)
	}

	return await res.text()
}

async function processSheet(sheet) {
	console.log(`Downloading ${sheet.name}...`)

	const csv = await downloadCsv(csvUrl(sheet.sheetId, sheet.gid))

	const rows = parse(csv, {
		columns: true,
		skip_empty_lines: true,
	})

	const languageBuffers = {}

	for (const lang of Object.keys(LANG_MAP)) {
		languageBuffers[lang] = []
	}

	for (const row of rows) {
		const key = row.key?.trim()

		if (!key) continue

		const isNonTranslatable = row.no && row.no.toString().trim() !== ''

		for (const lang of Object.keys(LANG_MAP)) {
			// Non-translatable strings only belong in the default resources.
			if (isNonTranslatable && lang !== 'en') {
				continue
			}

			const value = escapeXml(convertIcuToAndroid(row[lang] || ""));

			const translatable =
				isNonTranslatable && lang === 'en' ? ' translatable="false"' : ''

			languageBuffers[lang].push(
				`    <string name="${key}"${translatable}>${value}</string>`
			)
		}
	}

	for (const [lang, folder] of Object.entries(LANG_MAP)) {
		const dir = path.join(OUTPUT_DIR, sheet.name, folder)

		await fs.mkdir(dir, { recursive: true })

		const xml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
${languageBuffers[lang].join('\n')}
</resources>
`

		await fs.writeFile(path.join(dir, 'strings.xml'), xml)
	}

	console.log(`✓ ${sheet.name} complete`)
}

async function main() {
	for (const sheet of SHEETS) {
		await processSheet(sheet)
	}

	console.log('Done.')
}

main().catch(err => {
	console.error(err)
	process.exit(1)
})
