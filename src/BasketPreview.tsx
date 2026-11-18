import { useId } from 'react'
const silhouettes: Record<string, string> = {
 '7g': 'M37 123C37 97 77 77 128 77C179 77 219 97 219 123C219 141 204 152 189 159L177 176C157 199 97 199 77 176L64 159C47 150 37 139 37 123Z',
 '14g': 'M23 112C23 79 71 52 127 52C185 52 229 79 229 112C229 129 220 142 213 149L207 173C193 216 66 216 49 173L41 149C29 139 23 126 23 112Z',
 '18g': 'M24 108C24 72 71 42 128 42C186 42 231 72 231 108C231 126 222 139 218 144L212 176C200 223 57 223 44 176L36 144C28 134 24 121 24 108Z',
 '20g': 'M30 86C30 54 74 28 128 28C182 28 226 54 226 86C226 100 220 112 215 120L209 170C202 231 53 231 42 170L37 120C31 110 30 99 30 86Z',
 '22g': 'M29 78C29 42 73 15 127 15C183 15 227 42 227 78C227 92 222 104 216 112L210 176C198 238 55 238 44 176L37 112C32 101 29 90 29 78Z',
 'stepdown': 'M16 91C16 59 65 34 127 34C189 34 236 59 236 91C236 113 223 131 208 140L202 155L198 181C184 218 65 218 55 181L51 155L43 140C26 130 16 112 16 91Z',
}
export function BasketPreview({ id, url }: { id: string; url: string }) {
 const clip = useId().replace(/:/g, '')
 return <span className="photo basket-preview" aria-hidden="true"><svg viewBox="0 0 256 256"><defs><clipPath id={clip}><path d={silhouettes[id]} /></clipPath></defs><image href={url} width="256" height="256" clipPath={`url(#${clip})`} /></svg></span>
}
