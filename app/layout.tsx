import type { Metadata } from "next";
import "./globals.css";
const basePath=process.env.NEXT_PUBLIC_BASE_PATH??"";
export const metadata:Metadata={title:"Gestion Cross",description:"Organisez un cross scolaire de A à Z : participants, dossards, arrivées multi-postes, classements individuels, challenge interclasses et publications.",icons:{icon:`${basePath}/logo-bon-sauveur-cross.png`,shortcut:`${basePath}/logo-bon-sauveur-cross.png`}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="fr"><body className="antialiased">{children}</body></html>}
