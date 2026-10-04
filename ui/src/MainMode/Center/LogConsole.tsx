import React from 'react'
import type { LogLine } from '../types'

interface LogConsoleProps {
  log: LogLine[]
  height: number
}

export const LogConsole: React.FC<LogConsoleProps> = ({ log, height }) => {
  return (
    <div
      style={{ height: `${height}px` }}
      className="shrink-0 border-t border-subtle overflow-y-auto p-2"
    >
      <h3 className="text-xs font-semibold text-fg-secondary m-0 mb-1">
        操作记录
      </h3>
      {log.length === 0 && (
        <p className="text-xs text-fg-tertiary m-0">还没有操作</p>
      )}
      {log.map((l) => (
        <pre
          key={l.id}
          className={`text-2xs m-0 whitespace-pre-wrap font-mono ${
            l.tone === 'err'
              ? 'text-err'
              : l.tone === 'ok'
                ? 'text-ok'
                : 'text-fg-secondary'
          }`}
        >
          {l.text}
        </pre>
      ))}
    </div>
  )
}
