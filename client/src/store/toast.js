import create from 'zustand'

let counter = 0

const useToastStore = create(set => ({
  toasts: [],
  push(message, variant = 'info', duration = 4000){
    const id = ++counter
    const toast = { id, message, variant }
    set(state => ({ toasts: [...state.toasts, toast] }))
    if(duration > 0){
      setTimeout(() => {
        set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }))
      }, duration)
    }
    return id
  },
  dismiss(id){
    set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }))
  },
}))

export default useToastStore
