import { createHash } from 'node:crypto'

/**
 * GitHub publishes each release asset's SHA-256 as `sha256:<hex>`. The size
 * catches a cut-off download; this catches everything else, and the file is about
 * to be run as an installer. A release without a digest (older assets) passes on
 * size alone; a digest we cannot read is refused rather than ignored.
 */
export function checksumOk(data: Uint8Array, digest: string | undefined): boolean {
  if (!digest) return true
  const match = /^sha256:([0-9a-f]{64})$/i.exec(digest)
  if (!match) return false
  return createHash('sha256').update(data).digest('hex') === match[1].toLowerCase()
}
