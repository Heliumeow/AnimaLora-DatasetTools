import React from 'react'
import Button from '@repo/components/Button'
import type { BackupInfo } from '../../api'

interface BackupsSectionProps {
  backups: BackupInfo[]
  onRefreshBackups: () => void
  onRestore: (dir: string) => void
}

export const BackupsSection: React.FC<BackupsSectionProps> = ({
  backups,
  onRefreshBackups,
  onRestore,
}) => {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-fg-secondary m-0">
        还原点（{backups.length}）
        <Button
          size="xs"
          variant="ghost"
          className="ml-2"
          onClick={onRefreshBackups}
        >
          刷新
        </Button>
      </h3>
      <div className="space-y-1">
        {backups.map((b) => (
          <div
            key={b.dir}
            className="text-2xs font-mono border border-subtle rounded p-1.5"
          >
            <div className="text-fg-secondary">
              {b.op} · {b.count} 项
            </div>
            <div className="text-fg-tertiary">
              {b.created.replace('T', ' ').replace('+00:00', 'Z')}
            </div>
            <Button size="xs" variant="ghost" onClick={() => onRestore(b.dir)}>
              回滚…
            </Button>
          </div>
        ))}
        {backups.length === 0 && (
          <p className="text-2xs text-fg-tertiary m-0">还没有还原点</p>
        )}
      </div>
    </section>
  )
}
