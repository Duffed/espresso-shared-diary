import { useEffect } from 'react'

// Read only the image supplied by a user-initiated paste, without clipboard permissions.
export function usePhotoPaste(busy: boolean, onPhoto: (file: File) => void, onError: (message: string) => void) {
  useEffect(() => {
    function paste(event: ClipboardEvent) {
      const item = Array.from(event.clipboardData?.items ?? []).find(item => item.kind === 'file' && item.type.startsWith('image/'))
      if (!item) return // Normal text paste into names and other fields remains unchanged.
      event.preventDefault()
      if (busy) return
      const file = item.getAsFile()
      if (!file) return
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5242880) {
        onError('Wähle ein JPG-, PNG- oder WebP-Bild bis 5 MB.')
        return
      }
      onError('')
      onPhoto(file)
    }
    document.addEventListener('paste', paste)
    return () => document.removeEventListener('paste', paste)
  }, [busy, onPhoto, onError])
}
