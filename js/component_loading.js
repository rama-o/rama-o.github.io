const template = document.createElement('template')
template.innerHTML = `
  <style>
    :host {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: rgb(15 22 42);
      color: #e5e7eb;
      font-size: 2rem;
      z-index: 9999;
      transition:
        transform 200ms cubic-bezier(.4, 0, .2, 1),
        opacity 400ms ease;
    }

    :host([hidden]) {
      display: none;
    }

    :host([data-state="hiding"]) {
      transform: translateY(-100%);
    }
  </style>

  <div>Loading</div>
`

// Injected immediately when the script runs — before any layout happens
const pageStyle = document.createElement('style')
pageStyle.dataset.owner = 'rama-loading'
pageStyle.textContent = `nav, main { opacity: 0; }`
document.head.appendChild(pageStyle)

customElements.define(
  'rama-loading',
  class extends HTMLElement {
    constructor() {
      super()
      this.attachShadow({ mode: 'open' })
      this.shadowRoot.appendChild(
        template.content.cloneNode(true)
      )
    }

    hide() {
      // Reveal content at the same time the loading screen starts leaving
      document.querySelector('style[data-owner="rama-loading"]')?.remove()

      this.setAttribute('data-state', 'hiding')
      setTimeout(() => {
        this.setAttribute('hidden', '')
        this.removeAttribute('data-state')
      }, 650)
    }

    async connectedCallback() {
      const url = this.getAttribute('blocking-request')

      const waitForLoad = new Promise(resolve => {
        if (document.readyState === 'complete') {
          resolve()
        } else {
          window.addEventListener('load', () => resolve(), { once: true })
        }
      })

      const waitForFetch = url
        ? fetch(url).catch(err =>
            console.error('Failed to fetch blocking request:', err)
          )
        : Promise.resolve()

      await Promise.all([waitForLoad, waitForFetch])
      await this.waitForDomStable(200)

      this.hide()
    }

    async waitForDomStable(stableMs = 200) {
      return new Promise(resolve => {
        let timeout

        const settle = () => {
          clearTimeout(timeout)
          timeout = setTimeout(() => {
            observer.disconnect()
            resolve()
          }, stableMs)
        }

        const observer = new ResizeObserver(settle)
        observer.observe(document.body)
        observer.observe(document.documentElement)
        settle()
      })
    }
  }
)