import React, { useState } from 'react'
import type { SourceQuoteRef } from '@/types/display'

interface SourceQuoteTooltipProps {
  quotes: SourceQuoteRef[]
  /** Trigger element */
  children: React.ReactNode
}

/**
 * "View source quote" tooltip/modal component.
 * Receives pre-built SourceQuoteRef objects from the display interpreter.
 * Does NOT access raw extraction data.
 */
export function SourceQuoteTooltip({ quotes, children }: SourceQuoteTooltipProps) {
  const [isOpen, setIsOpen] = useState(false)

  if (quotes.length === 0) return <>{children}</>

  return (
    <div className="source-quote-wrapper">
      <div
        className="source-quote-trigger"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => e.key === 'Enter' && setIsOpen(!isOpen)}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-label="View source quote"
      >
        {children}
        <span className="source-quote-icon" title="Source quote available">
          📄
        </span>
      </div>

      {isOpen && (
        <div className="source-quote-panel" role="dialog" aria-label="Source quote">
          <div className="source-quote-panel__header">
            <h4>Source Quotes ({quotes.length})</h4>
            <button
              onClick={() => setIsOpen(false)}
              className="source-quote-panel__close"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="source-quote-panel__body">
            {quotes.map((q) => (
              <blockquote key={q.quoteId} className="source-quote-item">
                <p className="source-quote-item__text">&ldquo;{q.snippet}&rdquo;</p>
                {q.snippetNormalized && (
                  <p className="source-quote-item__normalized">
                    <em>Translated: {q.snippetNormalized}</em>
                  </p>
                )}
                <footer className="source-quote-item__meta">
                  {q.page && <span>Page {q.page}</span>}
                  {q.section && <span> — {q.section}</span>}
                  <span> (Confidence: {(q.confidence * 100).toFixed(0)}%)</span>
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
