import 'https://cdn.jsdelivr.net/gh/nano-grid/nano-grid@v5.3.1/dist/nanogrid.js'

import {
	getPrefix,
	createNode,
	normalize,
} from './helpers.js'
import { currentRoute, filters } from './params.js'

import './component_navbar.js'
import './component_footer.js'

export {
	normalize,
	getPrefix,
	currentRoute,
	createNode,
	filters,
}
