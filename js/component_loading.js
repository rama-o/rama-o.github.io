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

    .loader {
      display: flex;
      gap: 14px;
      align-items: center;
    }

    .dot {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--accent-color, #94f6a9);
      animation: bounce 1.2s ease-in-out infinite;
    }

    .dot:nth-child(1) { animation-delay: 0s; }
    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }

    @keyframes bounce {
      0%, 80%, 100% { transform: translateY(0); }
      40% { transform: translateY(-18px); }
    }
  </style>

  <div class="loader" aria-label="Loading">
    <div class="dot"></div>
    <div class="dot"></div>
    <div class="dot"></div>
  </div>
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