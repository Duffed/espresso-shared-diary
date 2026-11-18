// Recognize previously saved built-in images without changing uploaded photos.
const originals: Record<string,string> = {
  "ff10c18500289b96d44aea639aa1719d9f76677d36cda7b615aecda5fe0d3980": "7g",
  "1a754be01a42c3cea814adf6787ec52fc28ad5af254201076443a435e85f055d": "14g",
  "0d14f60f2ee92904f6a005c00dce10a8f806506e33d1a0f81fb1d99fd29ca380": "18g",
  "ae8c9754ef0286cc2d41079a1d7a3c042a5d29894244deb8811b5f00e0cd5ce3": "20g",
  "0db58595510a535010fa0917a1cc88dea6a1859679f7f6df983faa215f246f71": "22g",
  "cf9cec42c4bd1084c7830ff4724623635e392ef886dab0b9831f20b3a5d91680": "stepdown"
}
export async function transparentBasket(photo: Blob): Promise<string | undefined> {
 const bytes = await photo.arrayBuffer()
 const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2,'0')).join('')
 const id = originals[hash]
 return id ? import.meta.env.BASE_URL + 'baskets/' + id + '.svg' : undefined
}
