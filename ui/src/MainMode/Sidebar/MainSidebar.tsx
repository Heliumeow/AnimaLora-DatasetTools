import React from 'react'
import type { BackupInfo, Filter, Scan } from '../../api'
import { BackupsSection } from './BackupsSection'
import { FilterSection } from './FilterSection'
import { GroupExportSection } from './GroupExportSection'
import { RejectSection } from './RejectSection'
import { ScopeSection } from './ScopeSection'

export interface MainSidebarProps {
  root: string
  defaultRoot?: string
  recentRoots: string[]
  scan: Scan | null
  onSetRoot: (p: string) => void
  onClearRecentRoots: () => void
  onOpenPicker: () => void

  rejectDir: string
  onSetRejectDir: (d: string) => void
  onOpenRejectPicker: () => void
  onCleanEmptyDirs: () => void

  filterDesc: string
  onApplyFilter: (f: Filter) => void

  selectedCount: number
  group: string
  destDir: string
  onSetGroup: (g: string) => void
  onSetDestDir: (d: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onInvertSelection: () => void
  onDoSelect: () => void
  onDoUnselect: () => void

  backups: BackupInfo[]
  onRefreshBackups: () => void
  onRestore: (dir: string) => void
}

export const MainSidebar: React.FC<MainSidebarProps> = ({
  root,
  defaultRoot,
  recentRoots,
  scan,
  onSetRoot,
  onClearRecentRoots,
  onOpenPicker,
  rejectDir,
  onSetRejectDir,
  onOpenRejectPicker,
  onCleanEmptyDirs,
  filterDesc,
  onApplyFilter,
  selectedCount,
  group,
  destDir,
  onSetGroup,
  onSetDestDir,
  onSelectAll,
  onClearSelection,
  onInvertSelection,
  onDoSelect,
  onDoUnselect,
  backups,
  onRefreshBackups,
  onRestore,
}) => {
  return (
    <aside className="ui-app-shell-sidebar shrink-0 bg-sunken border-r border-subtle flex flex-col overflow-hidden h-full">
      <div className="ui-app-shell-sidebar-brand flex items-center border-b border-subtle shrink-0 px-3.5">
        <span className="type-panel-title">dskit</span>
      </div>
      <div className="ui-app-shell-sidebar-nav flex-1 flex flex-col gap-3 px-2 py-3.5 overflow-y-auto">
        <ScopeSection
          root={root}
          defaultRoot={defaultRoot}
          recentRoots={recentRoots}
          scan={scan}
          onSetRoot={onSetRoot}
          onClearRecentRoots={onClearRecentRoots}
          onOpenPicker={onOpenPicker}
        />

        <RejectSection
          root={root}
          rejectDir={rejectDir}
          scan={scan}
          onSetRejectDir={onSetRejectDir}
          onOpenRejectPicker={onOpenRejectPicker}
          onCleanEmptyDirs={onCleanEmptyDirs}
        />

        <FilterSection
          filterDesc={filterDesc}
          onApplyFilter={onApplyFilter}
        />

        <GroupExportSection
          selectedCount={selectedCount}
          group={group}
          destDir={destDir}
          onSetGroup={onSetGroup}
          onSetDestDir={onSetDestDir}
          onSelectAll={onSelectAll}
          onClearSelection={onClearSelection}
          onInvertSelection={onInvertSelection}
          onDoSelect={onDoSelect}
          onDoUnselect={onDoUnselect}
        />

        <BackupsSection
          backups={backups}
          onRefreshBackups={onRefreshBackups}
          onRestore={onRestore}
        />
      </div>
    </aside>
  )
}
