import { getPrefix } from './head.js'

customElements.define(
	getPrefix('footer'),
	class extends HTMLElement {
		constructor() {
			super()
		}

		#data = {
			template: `
    <footer class="page-footer">
      <p>Built with <span class="heart"></span> by <a href="https://github.com/pomboverso" target="_BLANK">Pombo</a>.</p>
      <ul>
        <li>
          <a href="https://github.com/rama-io" target="_BLANK">github</a>
        </li>
        <li>
          <a href="https://www.youtube.com/@rama-io" target="_BLANK">youtube</a>
        </li>
         <li>
          <a href="https://discord.gg/zFFupY8PFE" target="_BLANK">discord</a>
        </li>
      </ul>
      <time datetime="2026/05/02">2026.05.02</time>
    </footer>
  `,
		}

		connectedCallback() {
			this.innerHTML = this.#data.template
		}
	}
)
