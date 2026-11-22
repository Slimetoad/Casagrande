import type { Metadata } from 'next'
export const metadata:Metadata = {title:'Posgrados · Universidad Casa Grande',description:'Explora maestrías y encuentra orientación para tu posgrado.'}
export default function Layout({children}:{children:React.ReactNode}) {
  return <html lang="es-EC"><body>{children}</body></html>
}
