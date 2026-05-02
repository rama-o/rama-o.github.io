const home = {
	url: 'https://chip-defense.github.io/',
}

const modulePrefix = 'chip'

function getPrefix(name) {
	return [modulePrefix, name].join('-')
}

function createNode({
	type,
	parent,
	text,
	attrs,
	innerHTML,
}) {
	const node = document.createElement(type || 'div')

	node.innerHTML = innerHTML ? innerHTML : ''
	text && node.appendChild(document.createTextNode(text))

	if (attrs) {
		Object.entries(attrs).forEach(([key, value]) => {
			const attr = document.createAttribute(key)
			attr.value = value
			node.setAttributeNode(attr)
		})
	}

	parent && parent.appendChild(node)
	return node
}

function normalize(str) {
	return (
		str
			?.toLowerCase()
			.trim()
			.replace(/[\s\-+]+/g, '_')
			.replace(/_+/g, '_') || ''
	)
}

export {
	home,
	modulePrefix,
	getPrefix,
	createNode,
	normalize,
}
