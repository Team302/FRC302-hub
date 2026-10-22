// Runs an API call and reports the outcome as a toast. Resolves to the result, or undefined
// when it failed (the error has already been shown).
import { useCallback } from 'react'
import { useToast } from '../context/ToastContext'

export default function useRun() {
  const { success, error } = useToast()
  return useCallback(async (fn, okMessage) => {
    try {
      const out = await fn()
      if (okMessage) success(okMessage)
      return out
    } catch (e) {
      error('Couldn’t save that', e.message)
      return undefined
    }
  }, [success, error])
}
