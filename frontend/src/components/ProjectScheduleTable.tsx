import React, { useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
  createColumnHelper
} from '@tanstack/react-table'
import { Task } from '../hooks/useTasks'
import { DatePickerCell } from './DatePickerCell'
import { ColumnVisibilityMenu } from './ColumnVisibilityMenu'
import { formatDate } from '../utils/dateFormat'

interface ProjectScheduleTableProps {
  tasks: Task[]
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void
  onDeleteTask: (taskId: string) => void
  onSelectTask: (taskId: string | null) => void
  selectedTaskId?: string
  projectId?: string
}

export const ProjectScheduleTable: React.FC<ProjectScheduleTableProps> = ({
  tasks,
  onUpdateTask,
  onDeleteTask,
  onSelectTask,
  selectedTaskId,
  projectId
}) => {
  const columnHelper = createColumnHelper<Task>()

  const columns = useMemo<ColumnDef<Task, any>[]>(() => [
    columnHelper.accessor('wbsCode', {
      id: 'wbsCode',
      header: 'WBS',
      cell: ({ getValue }) => (
        <div className="px-2 py-1 text-sm font-medium text-gray-900">
          {getValue()}
        </div>
      ),
      size: 80
    }),
    columnHelper.accessor('title', {
      id: 'title',
      header: 'Description',
      cell: ({ getValue, row }) => (
        <div className="px-2 py-1 text-sm">
          <span className="font-medium">{getValue()}</span>
          {row.original.description && (
            <div className="text-xs text-gray-500 mt-1">
              {row.original.description}
            </div>
          )}
        </div>
      ),
      size: 200
    }),
    columnHelper.accessor('duration', {
      id: 'duration',
      header: 'Duration',
      cell: ({ getValue }) => (
        <div className="px-2 py-1 text-sm text-center">
          {getValue()}d
        </div>
      ),
      size: 80
    }),
    columnHelper.accessor('startDate', {
      id: 'startDate',
      header: 'Start Date',
      cell: ({ getValue, row }) => (
        <div className="px-2 py-1">
          <DatePickerCell
            value={getValue()}
            onChange={(date) => onUpdateTask(row.original.id, { startDate: date })}
          />
        </div>
      ),
      size: 120
    }),
    columnHelper.accessor('endDate', {
      id: 'endDate',
      header: 'Finish Date',
      cell: ({ getValue }) => (
        <div className="px-2 py-1 text-sm text-center">
          {formatDate(getValue())}
        </div>
      ),
      size: 120
    }),
    columnHelper.accessor('budget', {
      id: 'budget',
      header: 'Budget',
      cell: ({ getValue }) => (
        <div className="px-2 py-1 text-sm text-right">
          ${getValue()?.toLocaleString() || '0'}
        </div>
      ),
      size: 100
    }),
    columnHelper.accessor('resourceRole', {
      id: 'resourceRole',
      header: 'Resource Role',
      cell: ({ getValue }) => (
        <div className="px-2 py-1 text-sm">
          {getValue() || '-'}
        </div>
      ),
      size: 120
    }),
    columnHelper.accessor('isMilestone', {
      id: 'isMilestone',
      header: 'Type',
      cell: ({ getValue }) => (
        <div className="px-2 py-1 text-sm text-center">
          {getValue() ? 'Milestone' : 'Task'}
        </div>
      ),
      size: 80
    })
  ], [onUpdateTask])

  const table = useReactTable({
    data: tasks,
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: {
      columnVisibility: {}
    },
    onColumnVisibilityChange: () => {}
  })

  const storageKey = `gridCols:${projectId || 'default'}`

  return (
    <div className="w-full overflow-auto">
      <table className="w-full border-collapse border border-gray-200">
        <thead>
          <ColumnVisibilityMenu table={table} storageKey={storageKey}>
            <tr className="w-full">
              {table.getHeaderGroups().map(headerGroup => (
                headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    className="border border-gray-200 bg-gray-50 px-2 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider"
                    style={{ width: header.getSize() }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </th>
                ))
              ))}
            </tr>
          </ColumnVisibilityMenu>
        </thead>
        <tbody>
          {table.getRowModel().rows.map(row => (
            <tr
              key={row.id}
              className={`
                border-b border-gray-200 hover:bg-gray-50 cursor-pointer
                ${selectedTaskId === row.original.id ? 'bg-blue-50' : ''}
              `}
              onClick={() => onSelectTask(row.original.id)}
            >
              {row.getVisibleCells().map(cell => (
                <td
                  key={cell.id}
                  className="border border-gray-200 px-2 py-1"
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
} 