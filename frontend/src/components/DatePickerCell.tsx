import React, { useEffect, useRef, useState } from 'react'
import flatpickr from 'flatpickr'
import 'flatpickr/dist/flatpickr.min.css'
import { formatDate } from '../utils/dateFormat'

interface DatePickerCellProps {
  value: string
  onChange: (date: string) => void
  onBlur?: () => void
  disabled?: boolean
  className?: string
}

export const DatePickerCell: React.FC<DatePickerCellProps> = ({
  value,
  onChange,
  onBlur,
  disabled = false,
  className = ''
}) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const flatpickrRef = useRef<flatpickr.Instance | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    if (inputRef.current && !disabled) {
      flatpickrRef.current = flatpickr(inputRef.current, {
        dateFormat: 'Y-m-d',
        defaultDate: value,
        onReady: () => {
          if (inputRef.current) {
            inputRef.current.value = formatDisplayDate(value)
          }
        },
        onChange: (selectedDates) => {
          if (selectedDates.length > 0) {
            const dateStr = selectedDates[0].toISOString().split('T')[0]
            onChange(dateStr)
            if (inputRef.current) {
              inputRef.current.value = formatDisplayDate(dateStr)
            }
          }
        },
        onClose: () => {
          setIsEditing(false)
          onBlur?.()
        }
      })
    }

    return () => {
      if (flatpickrRef.current) {
        flatpickrRef.current.destroy()
        flatpickrRef.current = null
      }
    }
  }, [value, onChange, onBlur, disabled])

  const handleClick = () => {
    if (!disabled && flatpickrRef.current) {
      setIsEditing(true)
      flatpickrRef.current.open()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
    if (e.key === 'Escape') {
      setIsEditing(false)
      flatpickrRef.current?.close()
    }
  }

  const formatDisplayDate = (dateStr: string) => {
    try {
      return formatDate(dateStr)
    } catch {
      return dateStr
    }
  }

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={formatDisplayDate(value)}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        readOnly
        disabled={disabled}
        className={`
          w-full px-1 py-0.5 text-xs border-0 bg-transparent cursor-pointer text-center
          hover:bg-gray-50 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:ring-opacity-50
          rounded transition-colors duration-150
          ${disabled ? 'cursor-not-allowed opacity-50' : ''}
          ${isEditing ? 'bg-white ring-2 ring-sky-500 ring-opacity-50' : ''}
        `}
        tabIndex={disabled ? -1 : 0}
      />
    </div>
  )
} 