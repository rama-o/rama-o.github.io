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

customElements.define(
  'chip-loading',
  class extends HTMLElement {
    constructor() {
      super()
      this.attachShadow({ mode: 'open' })
      this.shadowRoot.appendChild(
        template.content.cloneNode(true)
      )
    }

    hide() {
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
          window.addEventListener('load', () => resolve(), {
            once: true,
          })
        }
      })

      const waitForFetch = url
        ? fetch(url).catch(err =>
            console.error(
              'Failed to fetch blocking request:',
              err
            )
          )
        : Promise.resolve()

      // wait for HTML and fetch
      await Promise.all([waitForLoad, waitForFetch])

      // Wait for DOM to stabilize
      await this.waitForDomStable(200) // 200ms stable

      this.hide()
    }

    // Helper function to wait until the document body stops resizing
    async waitForDomStable(stableMs = 200) {
      return new Promise(resolve => {
        let timeout
        let lastHeight = document.body.scrollHeight

        const observer = new ResizeObserver(() => {
          const currentHeight = document.body.scrollHeight
          if (currentHeight !== lastHeight) {
            lastHeight = currentHeight
            clearTimeout(timeout)
            timeout = setTimeout(() => {
              observer.disconnect()
              resolve()
            }, stableMs)
          }
        })

        observer.observe(document.body)

        // also handle case where body never changes after load
        timeout = setTimeout(() => {
          observer.disconnect()
          resolve()
        }, stableMs)
      })
    }
  }
)
