import { ThemeProvider } from '@lib/providers/theme-provider'
import { Toaster } from '@ui/sonner'
import { Metadata } from 'next'
import { FC, PropsWithChildren } from 'react'
import './globals.css'

const APP_NAME = 'Keyboard Studio'
const APP_DESCRIPTION =
    'Keyboard Studio turns Keyboard Layout Editor (KLE) JSON into a live, editable keyboard layout, then generates switch plates (STL, DXF, SVG, JSCAD) and KiCad PCB projects for handwired and hotswap builds.'

export const metadata: Metadata = {
    applicationName: APP_NAME,
    title: {
        default: APP_NAME,
        template: `%s | ${APP_NAME}`,
    },
    description: APP_DESCRIPTION,
    authors: [{ name: 'Hyunseok Byun' }],
    creator: 'Hyunseok Byun',
    robots: { index: true, follow: true },
    openGraph: {
        type: 'website',
        siteName: APP_NAME,
        title: APP_NAME,
        description: APP_DESCRIPTION,
        locale: 'en_US',
    },
}

const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    'name': APP_NAME,
    'description': APP_DESCRIPTION,
    'applicationCategory': 'DesignApplication',
    'operatingSystem': 'Web browser',
    'author': { '@type': 'Person', 'name': 'Hyunseok Byun' },
    'offers': { '@type': 'Offer', 'price': '0', 'priceCurrency': 'USD' },
}).replace(/</g, '\\u003c')

const Layout: FC<PropsWithChildren> = ({ children }) => {
    return (
        <html lang='en' suppressHydrationWarning>
            <body className='antialiased relative'>
                <ThemeProvider attribute='class' defaultTheme='system' enableSystem disableTransitionOnChange>
                    {children}
                </ThemeProvider>
                <Toaster />
                <script type='application/ld+json' dangerouslySetInnerHTML={{ __html: jsonLd }} />
            </body>
        </html>
    )
}

export default Layout
