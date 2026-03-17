module.exports = {
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './components/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
    './tests/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        parchment: {
          DEFAULT: '#f4ecd8',
          dark: '#e5d5b7',
          light: '#fdf6e3',
          soft: '#f8f1e0',
          ivory: '#fffaf0',
          mist: '#fcf8ed',
          sand: '#efe6d0',
        },
        ink: {
          DEFAULT: '#2c2c2c',
          faded: '#5a5a5a',
        },
        vermilion: '#b22222',
        bronze: '#a67c52',
        gold: '#daa520',
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', '"Source Han Serif SC"', 'serif'],
        sans: ['"Noto Sans SC"', 'sans-serif'],
        calligraphy: ['"Ma Shan Zheng"', 'cursive'],
      },
      boxShadow: {
        scroll: '3px 3px 8px rgba(0, 0, 0, 0.15)',
        parchment: '0 25px 50px -12px rgba(166, 124, 82, 0.5)',
        'glow-gold': '0 0 30px rgba(218, 165, 32, 0.55)',
        'glow-vermilion': '0 0 35px rgba(178, 34, 34, 0.45)',
      },
      backgroundImage: {
        'paper-fibers': 'url("https://www.transparenttextures.com/patterns/paper-fibers.png")',
        'rice-paper': 'url("https://www.transparenttextures.com/patterns/rice-paper-2.png")',
        clouds: 'url("https://www.transparenttextures.com/patterns/stardust.png")',
      },
    },
  },
  plugins: [],
};
