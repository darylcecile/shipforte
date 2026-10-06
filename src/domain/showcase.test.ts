import assert from 'node:assert/strict'
import { test } from 'node:test'
import { highlightExcerpt, highlightSchema, videoEmbed } from './showcase'
import { socialCardSvg, wrapCardText } from './social-card'

test('recording embeds use known HTTPS hosts and safe provider IDs', () => {
  assert.equal(
    videoEmbed('https://www.youtube.com/watch?v=abcdefghijk'),
    'https://www.youtube-nocookie.com/embed/abcdefghijk',
  )
  assert.equal(
    videoEmbed('https://youtu.be/abcdefghijk?t=10'),
    'https://www.youtube-nocookie.com/embed/abcdefghijk',
  )
  assert.equal(videoEmbed('https://vimeo.com/1234'), 'https://player.vimeo.com/video/1234')
  for (const url of [
    'javascript:alert(1)',
    'http://youtu.be/abcdefghijk',
    'https://youtube.com.evil.example/watch?v=abcdefghijk',
    'https://user:secret@youtube.com/watch?v=abcdefghijk',
    'https://youtube.com/embed/a/b',
  ])
    assert.equal(videoEmbed(url), null)
  assert.equal(
    videoEmbed('https://twitch.tv/videos/1234'),
    null,
    'Other recording URLs remain external links',
  )
})
test('highlight offsets resolve only bounded non-empty text from the actual source', () => {
  assert.equal(highlightExcerpt('First\nImportant decision\nLast', 6, 24), 'Important decision')
  for (const [start, end] of [
    [-1, 1],
    [1, 0],
    [0, 100],
    [0.5, 3],
  ])
    assert.throws(() => highlightExcerpt('text', start, end))
  assert.throws(() => highlightExcerpt('x'.repeat(6001), 0, 6001))
  assert.throws(() => highlightExcerpt('  ', 0, 2))
  assert.equal(
    highlightSchema.safeParse({
      transcriptId: '00000000-0000-4000-8000-000000000001',
      startOffset: 1,
      endOffset: 1,
      caption: 'Moment',
    }).success,
    false,
  )
})
test('share card text is escaped and bounded even for long unbroken input', () => {
  const svg = socialCardSvg({
    title: '<script>alert(1)</script>',
    label: 'Project',
    subtitle: '"quoted" & text',
    detail: 'A builder',
  })
  assert.ok(!svg.includes('<script>'))
  assert.ok(svg.includes('&#60;script&#62;'))
  const lines = wrapCardText('x'.repeat(250), 34, 3)
  assert.equal(lines.length, 3)
  assert.ok(lines.every((line) => line.length <= 34))
  assert.ok(lines[2].endsWith('…'))
})
