import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata:Metadata={title:"باحث العقارات",description:"أداة عربية مستقلة للبحث والتحليل في إعلانات عقار",icons:{icon:"/favicon.svg"},openGraph:{title:"باحث العقارات",description:"بحث وتحليل وحساب عائد العقارات من الجوال",images:["/social-card.png"]}};
export const viewport:Viewport={width:"device-width",initialScale:1,themeColor:"#0b5d50"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ar" dir="rtl"><body>{children}</body></html>}
