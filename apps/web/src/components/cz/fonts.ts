/**
 * Fonts (next/font). Poppins for Latin, Lemon/Milk for Latin display, Noto families per script.
 * Variables are attached to <html> in src/app/[locale]/layout.tsx; globals.css picks the body /
 * display stacks per `lang` (see --cz-font-body / --cz-font-display).
 */
import {
  Noto_Nastaliq_Urdu,
  Noto_Sans_Arabic,
  Noto_Sans_Bengali,
  Noto_Sans_Devanagari,
  Noto_Sans_SC,
  Poppins,
} from 'next/font/google';
import localFont from 'next/font/local';

export const poppins = Poppins({ subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600', '700'], variable: '--font-poppins', display: 'swap' });

export const lemonMilk = localFont({ src: '../../fonts/LemonMilk.ttf', variable: '--font-lemon', weight: '400', display: 'swap', preload: true });

export const notoBengali = Noto_Sans_Bengali({ subsets: ['bengali'], weight: ['400', '500', '600'], variable: '--font-noto-bn', display: 'swap', preload: false });

export const notoNastaliq = Noto_Nastaliq_Urdu({ subsets: ['arabic'], weight: ['400', '600'], variable: '--font-noto-ur', display: 'swap', preload: false });

export const notoArabic = Noto_Sans_Arabic({ subsets: ['arabic'], weight: ['400', '500', '600', '700'], variable: '--font-noto-ar', display: 'swap', preload: false });

export const notoDevanagari = Noto_Sans_Devanagari({ subsets: ['devanagari'], weight: ['400', '500', '600', '700'], variable: '--font-noto-hi', display: 'swap', preload: false });

export const notoSC = Noto_Sans_SC({ weight: ['400', '500', '700'], variable: '--font-noto-sc', display: 'swap', preload: false });

export const fontVariables = [poppins, lemonMilk, notoBengali, notoNastaliq, notoArabic, notoDevanagari, notoSC].map((f) => f.variable).join(' ');
