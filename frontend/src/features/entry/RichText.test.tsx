import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { RichText } from './RichText'
import type { DocNode } from '../../lib/types'

function html(document: DocNode) {
  return renderToStaticMarkup(<RichText document={document} />)
}

describe('the stored document', () => {
  it('keeps the formatting it was written with', () => {
    const markup = html({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Morning' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' blue', marks: [{ type: 'textStyle', attrs: { color: '#27467a', fontSize: '20px' } }] },
          ],
        },
      ],
    })
    expect(markup).toContain('<h2>Morning</h2>')
    expect(markup).toContain('<strong>bold</strong>')
    expect(markup).toContain('color:#27467a')
    expect(markup).toContain('font-size:20px')
  })

  it('never turns stored content into script or style', () => {
    const markup = html({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
            { type: 'text', text: 'y', marks: [{ type: 'textStyle', attrs: { color: 'red;background:url(x)' } }] },
            { type: 'text', text: '<img src=x onerror=alert(1)>' },
          ],
        },
      ],
    })
    expect(markup).not.toContain('javascript')
    expect(markup).not.toContain('url(')
    expect(markup).not.toContain('<img')
  })
})
