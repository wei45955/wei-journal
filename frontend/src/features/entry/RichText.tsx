import { Fragment } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { safeColor, safeFontSize, safeHref } from '../../lib/safe'
import type { DocNode } from '../../lib/types'

/**
 * Renders a stored editor document node by node. Nothing is injected as
 * markup, and every attribute that reaches the page is checked first, so
 * stored content can never become a script or a stylesheet.
 */

function renderText(node: DocNode, key: string): ReactNode {
  let content: ReactNode = node.text ?? ''
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case 'bold':
        content = <strong>{content}</strong>
        break
      case 'italic':
        content = <em>{content}</em>
        break
      case 'underline':
        content = <u className="decoration-1 underline-offset-[3px]">{content}</u>
        break
      case 'strike':
        content = <s>{content}</s>
        break
      case 'code':
        content = <code>{content}</code>
        break
      case 'link': {
        const href = safeHref(mark.attrs?.href)
        if (href) {
          content = (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {content}
            </a>
          )
        }
        break
      }
      case 'textStyle': {
        const style: CSSProperties = {}
        const color = safeColor(mark.attrs?.color)
        const size = safeFontSize(mark.attrs?.fontSize)
        if (color) style.color = color
        if (size) style.fontSize = size
        if (color || size) content = <span style={style}>{content}</span>
        break
      }
      default:
        break
    }
  }
  return <Fragment key={key}>{content}</Fragment>
}

function render(nodes: DocNode[] | undefined): ReactNode {
  if (!nodes?.length) return null
  return nodes.map((node, index) => {
    const key = `${node.type ?? 'n'}-${index}`
    const children = render(node.content)
    switch (node.type) {
      case 'text':
        return renderText(node, key)
      case 'paragraph':
        return <p key={key}>{children ?? <br />}</p>
      case 'heading': {
        const level = Number(node.attrs?.level ?? 2)
        if (level <= 1) return <h1 key={key}>{children}</h1>
        if (level === 2) return <h2 key={key}>{children}</h2>
        return <h3 key={key}>{children}</h3>
      }
      case 'bulletList':
        return <ul key={key}>{children}</ul>
      case 'orderedList': {
        const start = Number(node.attrs?.start ?? 1)
        return (
          <ol key={key} start={Number.isFinite(start) ? start : 1}>
            {children}
          </ol>
        )
      }
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
      default:
        return <Fragment key={key}>{children}</Fragment>
    }
  })
}

export function RichText({ document, className }: { document?: DocNode | null; className?: string }) {
  if (!document?.content?.length) return null
  return <div className={className ?? 'page-text'}>{render(document.content)}</div>
}

/** Whether a document carries any visible words. */
export function hasText(document?: DocNode | null): boolean {
  const walk = (nodes?: DocNode[]): boolean =>
    (nodes ?? []).some((node) => (node.text ?? '').trim().length > 0 || walk(node.content))
  return walk(document?.content)
}
