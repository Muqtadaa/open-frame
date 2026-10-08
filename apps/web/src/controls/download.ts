/**
 * A file handed to the browser to keep, from text made here.
 *
 * The one way anything leaves the page as a file: the copy of a board this
 * build could not read, and an exported readout. Two copies of these lines
 * would be two places a fix to downloading had to land.
 */
export function downloadText(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  // After the click has been handed to the browser, not before.
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}

/**
 * A file name somebody would recognise in their downloads: the words of a
 * title, lower case, joined by hyphens. Parts that have no such words drop
 * out, and a name with none at all is `board`.
 */
export function fileNameFor(parts: readonly (string | null)[], extension: string): string {
  const slugs = parts.flatMap((part) => {
    const slug = (part ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    return slug === '' ? [] : [slug]
  })
  return `${slugs.length === 0 ? 'board' : slugs.join('-')}.${extension}`
}
