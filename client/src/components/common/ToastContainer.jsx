import React from 'react'
import useToastStore from '../../store/toast.js'

const variantStyles = {
  info: 'bg-slate-900/90 text-white',
  success: 'bg-emerald-600 text-white',
  warning: 'bg-amber-500 text-black',
  danger: 'bg-rose-600 text-white',
}

export default function ToastContainer(){
  const { toasts, dismiss } = useToastStore()
  return (
    <div className="fixed right-4 top-[72px] z-[70] flex flex-col items-end gap-2 p-4 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex w-full max-w-md items-center justify-between rounded-lg px-4 py-3 shadow-lg ${variantStyles[toast.variant] || variantStyles.info}`}
        >
          <span className="text-sm font-medium">{toast.message}</span>
          <button
            type="button"
            className="ml-3 text-xs uppercase tracking-wide"
            onClick={() => dismiss(toast.id)}
          >
            Close
          </button>
        </div>
      ))}
    </div>
  )
}
