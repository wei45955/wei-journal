import { Fragment, type ReactNode } from 'react'
import type { DocNode } from '../../lib/types'

/**
 * Renders a stored editor document.
 *
 * The document is a structured tree, not HTML, so it is turned into React
 * elements node by node. Nothing is injected as markup, which keeps stored
 * content from becoming a script.
 */

const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:']

export function safeHref(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null
  try {
    const url = new URL(raw, 'https://example.invalid')
    if (!SAFE_PROTOCOLS.includes(url.protocol)) return null
    return raw
  } catch {
    return null
  }
}

function renderText(node: DocNode, key: string): ReactNode {
  let content: ReactNode = node.text ?? ''
  const marks = node.marks ?? []
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        content = <strong>{content}</strong>
        break
      case 'italic':
        content = <em>{content}</em>
        break
      case 'strike':
        content = <s>{content}</s>
        break
      case 'underline':
        content = <u>{content}</u>
        break
      case 'code':
        content = <code>{content}</code>
        break
      case 'link': {
        const href = safeHref(mark.attrs?.href)
        if (href) {
          content = (
            <a href={href} rel="noopener noreferrer nofollow" target="_blank">
              {content}
            </a>
          )
        }
        break
      }
      default:
        break
    }
  }
  return <Fragment key={key}>{content}</Fragment>
}

function renderNodes(nodes: DocNode[] | undefined): ReactNode {
  if (!nodes || nodes.length === 0) return null
  return nodes.map((node, index) => {
    const key = `${node.type ?? 'node'}-${index}`
    const children = renderNodes(node.content)

    switch (node.type) {
      case 'text':
        return renderText(node, key)
      case 'paragraph':
        return <p key={key}>{children}</p>
      case 'heading': {
        const level = Number(node.attrs?.level ?? 2)
        if (level === 1) return <h1 key={key}>{children}</h1>
        if (level === 3) return <h3 key={key}>{children}</h3>
        return <h2 key={key}>{children}</h2>
      }
      case 'bulletList':
        return <ul key={key}>{children}</ul>
      case 'orderedList':
        return <ol key={key}>{children}</ol>
      case 'listItem':
        return <li key={key}>{children}</li>
      case 'blockquote':
        return <blockquote key={key}>{children}</blockquote>
      case 'codeBlock':
        return (
          <pre key={key}>
            <code>{children}</code>
          </pre>
        )
      case 'horizontalRule':
        return <hr key={key} />
      case 'hardBreak':
        return <br key={key} />
      case 'image': {
        const src = safeHref(node.attrs?.src)
        if (!src) return null
        return (
          <img
            key={key}
            src={src}
            alt={typeof node.attrs?.alt === 'string' ? node.attrs.alt : ''}
            loading="lazy"
            decoding="async"
          />
        )
      }
      default:
        return <div key={key}>{children}</div>
    }
  })
}

export function RichText({ document }: { document?: DocNode | null }) {
  const content = document?.content
  if (!content || content.length === 0) return null
  return <div className="rte">{renderNodes(content)}</div>
}
