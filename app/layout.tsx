import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
export const metadata: Metadata = {title:"Кафедра — вики команды",description:"Общая база знаний программистов и преподавателей. Статьи, учебные материалы и заметки вашей команды.",robots:{index:false,follow:false},icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ru" suppressHydrationWarning><body><Providers>{children}</Providers></body></html>}
