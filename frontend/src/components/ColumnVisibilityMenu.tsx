import React, { useEffect, useState } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { Eye, EyeOff } from 'lucide-react'
import { Table } from '@tanstack/react-table'
import { loadJSON, saveJSON } from '../utils/localStorage'

interface ColumnVisibilityMenuProps {
  table: Table<any>
  storageKey: string
  children: React.ReactElement
}

export const ColumnVisibilityMenu: React.FC<ColumnVisibilityMenuProps> = ({
  table,
  storageKey,
  children
}) => {
  const [visibleColumns, setVisibleColumns] = useState<string[]>([])

  // Load saved column visibility on mount
  useEffect(() => {
    const savedVisibility = loadJSON<string[]>(storageKey, [])
    setVisibleColumns(savedVisibility)
    
    // Apply saved visibility to table
    table.getAllLeafColumns().forEach(column => {
      const isVisible = savedVisibility.length === 0 || savedVisibility.includes(column.id)
      column.toggleVisibility(isVisible)
    })
  }, [table, storageKey])



  // Handle column visibility toggle
  const handleColumnToggle = (columnId: string) => {
    const column = table.getColumn(columnId)
    if (!column) return

    const newVisible = column.getIsVisible()
    column.toggleVisibility(!newVisible)

    // Update local state and save to localStorage
    const updatedVisibility = table.getAllLeafColumns()
      .filter(col => col.getIsVisible())
      .map(col => col.id)
    
    setVisibleColumns(updatedVisibility)
    saveJSON(storageKey, updatedVisibility)
  }

  // Get all leaf columns (non-grouped columns)
  const leafColumns = table.getAllLeafColumns()

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        {React.cloneElement(children, {
          onContextMenu: children.props.onContextMenu,
          className: `${children.props.className || ''} cursor-context-menu hover:bg-gray-50`.trim(),
          title: "Right-click to show column visibility menu"
        })}
      </ContextMenu.Trigger>
      
      <ContextMenu.Portal>
        <ContextMenu.Content
          className="min-w-[220px] bg-white rounded-md p-1 shadow-md border border-gray-200 z-50"
          sideOffset={5}
          align="start"
        >
          <ContextMenu.Label className="px-2 py-1.5 text-xs font-medium text-gray-500 border-b border-gray-100">
            Column Visibility
          </ContextMenu.Label>
          
          {leafColumns.map(column => {
            const isVisible = column.getIsVisible()
            return (
              <ContextMenu.CheckboxItem
                key={column.id}
                className={`
                  relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none
                  hover:bg-gray-100 focus:bg-gray-100 focus:text-gray-900
                  ${isVisible ? 'text-gray-900' : 'text-gray-500'}
                `}
                checked={isVisible}
                onCheckedChange={() => handleColumnToggle(column.id)}
              >
                <div className="flex items-center gap-2 w-full">
                  {isVisible ? (
                    <Eye className="w-4 h-4 text-gray-600" />
                  ) : (
                    <EyeOff className="w-4 h-4 text-gray-400" />
                  )}
                  <span className="flex-1">{column.columnDef.header as string}</span>
                </div>
              </ContextMenu.CheckboxItem>
            )
          })}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
} 