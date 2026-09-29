import type { Metadata } from "next";
import "./globals.css";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const metadata: Metadata={title:"Bon Sauveur Cross — Générateur de dossards",description:"Préparez les dossards du cross du Bon Sauveur sur feuilles A4, deux dossards A5 par page.",icons:{icon:`${basePath}/logo-bon-sauveur-cross.png`,shortcut:`${basePath}/logo-bon-sauveur-cross.png`}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="fr"><body className="antialiased">{children}</body></html>}
