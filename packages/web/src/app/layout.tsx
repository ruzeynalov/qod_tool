import type { Metadata } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'QOD - Quality Observability Dashboard',
  description: 'Unified quality engineering metrics and observability platform',
  icons: {
    icon: '/icon.svg',
    apple: '/apple-icon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('qod-theme');var s=localStorage.getItem('qod-skin');if(t==='light'||t==='dark'){document.documentElement.classList.add(t)}else{document.documentElement.classList.add('light')}if(s==='classic'){/* no class needed */}else{document.documentElement.classList.add('skin-modern')}}catch(e){document.documentElement.classList.add('light');document.documentElement.classList.add('skin-modern')}})()`,
          }}
        />
      </head>
      <body className="font-sans">
        {children}
      </body>
    </html>
  );
}
