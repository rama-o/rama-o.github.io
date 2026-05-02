import { getPrefix } from './head.js'
import svgPanZoom from './modules/svg-pan-zoom.mjs'

const gap = 600

customElements.define(
	getPrefix('design'),
	class extends HTMLElement {
		constructor() {
			super()
		}

		#data = [
			{
				img_path: '../img/design/home.svg',
				title: 'Home',
			},
			{
				img_path: '../img/design/select_level.svg',
				title: 'Select Level',
			},
			{
				img_path: '../img/design/game.svg',
				title: 'Game',
			},
			{
				img_path: '../img/design/game_menu.svg',
				title: 'Game Menu',
			},
			{
				img_path: '../img/design/settings.svg',
				title: 'Settings',
			},
			{
				img_path: '../img/design/about.svg',
				title: 'About',
			},
		]
			.map((e, index) => {
				const img = e?.img_path
					? `
          <image href="${e.img_path}" width="1920" x="${
						index * (1920 + gap)
					}" y="40" />
          `
					: `<rect x="${
							index * (1920 + gap)
						}" y="40" width="1920" height="400" fill="#333" />`

				return `
      <text y="0">
        <tspan fill="#fff" x="${
					index * (1920 + gap)
				}" font-size="6rem" font-weight="300">
          ${e.title}
        </tspan>
      </text>

      ${img}
    `
			})
			.join('')

		#template = `      
      <main>
        <section>
          <svg id="display" width="100%" height="100vh" viewBox="0 0 1920 1920">
            <defs>
              <clipPath id="circleMask">
                <rect x="0" y="0" width="40" height="40" rx="25" ry="25" />
              </clipPath>
            </defs>
            ${this.#data}
          </svg>
        </section>
      </main>
      `

		#init() {
			const panZoom = svgPanZoom('#display', {
				panEnabled: true,
				controlIconsEnabled: false,
				zoomEnabled: true,
				mouseWheelZoomEnabled: true,
				zoomScaleSensitivity: 0.2,
				minZoom: 0.1,
				maxZoom: 10,
			})

			panZoom.pan({
				x: 40,
				y: 150,
			})
		}

		async connectedCallback() {
			this.innerHTML = this.#template
			this.#init()
		}
	}
)
