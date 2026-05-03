import { getPrefix, currentRoute, filters } from './head.js'

customElements.define(
	getPrefix('navbar'),
	class extends HTMLElement {
		constructor() {
			super()
		}

		#template = `
    <nn-caja padding="1rem">
      <div class="nav-controls">
        <nav>
          <div class="mobile-controls">
            <button type="button" class="toggle" tabindex="0" aria-label="mobile menu button">
              <nn-icono class="bars"></nn-icono>
            </button>
            <button type="button" class="close-menu">
              <nn-icono class="times"></nn-icono>
            </button>
          </div>
          <ul>
            <li>
              <a target="_self" href="/" class="logo">
                SKBD <img src="./img/favicon_32x32.png" />
              </a>
            </li>

			<li class="searchbar-area">
              <search>
                <nn-fila class="search-bar">
                  <nn-pilar size="35px">
                    <nn-btn class="search-btn" aria-label="filter button">
                      <nn-icono class="filter"></nn-icono>
                    </nn-btn>
                  </nn-pilar>
                  <nn-pilar size="100% - 35px * 3">
                    <input type="text" autocomplete="off" autofocus aria-label="search bar input" />
                  </nn-pilar>
                  <nn-pilar size="35px">
                    <nn-btn class="clear-btn" aria-label="clear search bar button">
                      <nn-icono class="times"></nn-icono>
                    </nn-btn>
                  </nn-pilar>
                  <nn-pilar size="35px">
                    <nn-btn class="share-btn" aria-label="share filterd table button">
                      <nn-icono class="share-alt"></nn-icono>
                    </nn-btn>
                  </nn-pilar>
                </nn-fila>
              </search>
            </li>

            <li>
              <a target="_self" href="/">Home</a>
            </li>

			<li>
              <a target="_self" href="characters.html">Characters</a>
            </li>

            <li>
              <a target="_self" href="game.html">Glyph Arena</a>
            </li>

			<li>
              <nn-dropdown label="Developer Tools">
                <a target="_self" href="changelog.html">Changelog</a>
                <a data-hidden="true" target="_self" href="design.html">Design</a>
                <a data-hidden="true" target="_self" href="about.html">About ChipDefense: Copper</a>
              </nn-dropdown>
            </li>
            
          </ul>
        </nav>
      </div>

      <ul class="notifications">
      </ul>
    </nn-caja>
    `

		#data = {
			theme: 'dark',
			currentRoute,
			filterBy: 'all',
		}

		setTheme(theme) {
			const localTheme = theme || this.#data.theme
			localStorage.setItem('theme', localTheme)
			document.body.classList.remove('dark', 'light')
			document.body.classList.add(localTheme)
		}

		#setActiveLinks() {
			const activeLink = this.querySelector(
				this.#data.currentRoute === 'index'
					? `a[href^="/"]:not(.logo)`
					: `a[href^="${this.#data.currentRoute}"]`
			)
			activeLink?.classList.add('active')
		}

		#debounce(fn, delay = 300) {
			let timeout
			return (...args) => {
				clearTimeout(timeout)
				timeout = setTimeout(
					() => fn.apply(this, args),
					delay
				)
			}
		}

		#generateListeners() {
			const searchBar = this.querySelector(
				'.search-bar input'
			)
			const clearBtn = this.querySelector(
				'.search-bar .clear-btn'
			)
			const shareBtn = this.querySelector(
				'.search-bar .share-btn'
			)
			const notifications = this.querySelector(
				'.notifications'
			)

			let filterBy = undefined

			if (filters) {
				filterBy = filters
			}

			if (searchBar) {
				if (filterBy) {
					searchBar.value = filterBy
				}

				const debouncedDispatch = this.#debounce(() => {
					this.dispatchEvent(
						new CustomEvent('filter-change', {
							detail: { filterBy: searchBar.value },
							bubbles: true,
							composed: true,
						})
					)
				}, 200)
				searchBar.addEventListener(
					'input',
					debouncedDispatch
				)

				clearBtn.addEventListener('click', () => {
					filterBy = ''
					searchBar.value = ''
					searchBar.dispatchEvent(
						new Event('input', { bubbles: true })
					)
				})

				document.addEventListener('notify', e => {
					const { message, type } = e.detail
					const notifications = document.querySelector(
						'.notifications'
					)

					if (notifications) {
						const li = document.createElement('li')
						li.className = type
						li.innerHTML = message

						notifications.appendChild(li)

						setTimeout(() => {
							li.classList.add('fade-out')
							li.addEventListener('transitionend', () =>
								li.remove()
							)
						}, 3000)
					}
				})

				shareBtn.addEventListener('click', async () => {
					const url = new URL(window.location.href)
					url.searchParams.set('filterby', searchBar.value)
					const text = url.toString()

					try {
						await navigator.clipboard.writeText(text)

						this.dispatchEvent(
							new CustomEvent('notify', {
								detail: {
									message: `Copied to clipboard:<br>${text}`,
									type: 'success',
								},
								bubbles: true,
								composed: true,
							})
						)
					} catch (err) {
						console.error('Failed to copy!', err)

						this.dispatchEvent(
							new CustomEvent('notify', {
								detail: {
									message: 'Failed to copy to clipboard.',
									type: 'error',
								},
								bubbles: true,
								composed: true,
							})
						)
					}
				})
			}
		}

		connectedCallback() {
			this.innerHTML = this.#template
			const localTheme =
				localStorage.getItem('theme') || this.#data.theme
			this.#data.theme = localTheme

			const toggleBtn = this.querySelector('.toggle')
			const closeBtn = this.querySelector('.close-menu')

			toggleBtn.addEventListener('click', () => {
				this.classList.toggle('open')
			})

			closeBtn.addEventListener('click', () => {
				this.classList.remove('open')
			})

			this.#setActiveLinks()
			this.setTheme()

			const noSearchbar =
				this.hasAttribute('no-searchbar') ||
				this.hasAttribute('nosearchbar')
			if (noSearchbar) {
				this.querySelector('.searchbar-area').innerHTML = ''
			}

			this.#generateListeners()

			const themeSwitcher = this.querySelector('#theme')
			if (themeSwitcher) {
				this.querySelector('#theme').checked =
					localTheme === 'dark' ? true : false

				this.querySelector('#theme').addEventListener(
					'change',
					e => {
						e.target.checked
							? this.setTheme('dark')
							: this.setTheme('light')
					}
				)
			}
		}
	}
)
