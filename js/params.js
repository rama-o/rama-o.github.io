let currentRoute = 'index'
let filters = []

if (typeof window !== 'undefined') {
	const params = new URLSearchParams(window.location.search)
	currentRoute =
		window.location.pathname.split('.html')[0].slice(1) ||
		'index'

	filters = params.get('filterby')
}

export { filters, currentRoute }
