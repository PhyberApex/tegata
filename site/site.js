const LATEST_RELEASE_URL = 'https://api.github.com/repos/PhyberApex/tegata/releases/latest'

function setText(selector, text) {
  return document.querySelectorAll(selector).forEach((el) => {
    el.textContent = text
  })
}

// The version baked into the HTML is the fallback; a failed lookup leaves it in place.
fetch(LATEST_RELEASE_URL)
  .then(response => (response.ok
    ? response.json()
    : Promise.reject(response.status)))
  .then(({ tag_name: tag }) => {
    if (!/^v\d+\.\d+\.\d+$/.test(tag))
      return
    setText('[data-version]', tag.slice(1))
    setText('[data-version-prefixed]', tag)
  })
  .catch(() => {})

document.querySelectorAll('[data-copy-target]').forEach((button) => {
  const label = button.textContent
  button.addEventListener('click', () => {
    const source = document.getElementById(button.dataset.copyTarget)
    navigator.clipboard.writeText(source.textContent)
      .then(() => 'Copied')
      .catch(() => 'Copy failed')
      .then((result) => {
        button.textContent = result
        setTimeout(() => {
          button.textContent = label
        }, 1600)
      })
  })
})
