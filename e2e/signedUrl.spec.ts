import { BLOCK, expect, test } from './fixtures'
import { isProbe, type Origin } from './origin'

// A link like huggingface.co/…/resolve/… or github.com/…/releases/download/… redirects to a signed
// CDN URL that stops working later (HF's CloudFront `Expires` is +1 h). The link itself keeps
// redirecting to a fresh one. Plexo stores only the signed URL (probe.finalUrl), so once it
// expires the download fails, although the link it was given would still work.

/** /start redirects to the current signature; `expire()` makes the first one answer 403. */
function signedLink(origin: Origin): { expire: () => void } {
  let generation = 1
  let expired = false
  origin.setRule(({ path, range }) => {
    if (path === '/start') return { redirect: `/files/test.bin?sig=${generation}` }
    if (expired && path === '/files/test.bin?sig=1' && !isProbe(range)) return { status: 403 }
    return 'ok'
  })
  return {
    expire: () => {
      expired = true
      generation = 2
    }
  }
}

const startRequests = (origin: Origin): number =>
  origin.log.filter((entry) => entry.path === '/start').length

test('a signed URL that expires mid-download is re-resolved from the original link', async ({
  plexo,
  serve
}) => {
  const origin = await serve({ size: 64 * BLOCK, bytesPerSecond: 512 * 1024 })
  const link = signedLink(origin)
  const id = await plexo.start(origin.url('/start'), origin.sha256, { connections: 2 })
  await plexo.waitUntil((state) => state.bytesDownloaded > 4 * BLOCK, 20_000)
  link.expire()

  const state = await plexo.waitForStatus(['completed', 'error'], 60_000)
  console.log(
    'mid-download:',
    state.status,
    '|',
    state.error,
    '| /start hits:',
    startRequests(origin)
  )

  // The original link would have fixed it: relinking to it by hand completes the download.
  if (state.status === 'error') {
    await plexo.api.relinkDownload(id, origin.url('/start'))
    const after = await plexo.waitForStatus(['completed', 'error'], 60_000)
    console.log('after relink to the original link:', after.status)
  }
  expect(state.status).toBe('completed')
})

test('a signed URL that expired while paused is re-resolved on resume', async ({
  plexo,
  serve
}) => {
  const origin = await serve({ size: 64 * BLOCK, bytesPerSecond: 512 * 1024 })
  const link = signedLink(origin)
  const id = await plexo.start(origin.url('/start'), origin.sha256, { connections: 2 })
  await plexo.waitUntil((state) => state.bytesDownloaded > 4 * BLOCK, 20_000)
  await plexo.api.pauseDownload(id)
  await plexo.waitForStatus('paused')
  link.expire() // paused for longer than the signature lasts
  await plexo.api.resumeDownload(id)

  const state = await plexo.waitForStatus(['completed', 'error'], 60_000)
  console.log(
    'after resume:',
    state.status,
    '|',
    state.error,
    '| /start hits:',
    startRequests(origin)
  )
  expect(state.status).toBe('completed')
})
