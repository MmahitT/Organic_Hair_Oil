/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: { DEFAULT: '#234B35', 700: '#1B3B2A', 600: '#2C5D43' },
        sage: { DEFAULT: '#A8B99A', light: '#DDE5D5' },
        cream: { DEFAULT: '#FAF7EF', dark: '#F1ECDD' },
        gold: { DEFAULT: '#C6A46A', dark: '#8A6D35', soft: '#D6B97E' } /* soft = gold TEXT on forest (5.2:1); DEFAULT is for icons and borders */,
        charcoal: { DEFAULT: '#252525', soft: '#4A4A4A' },
        danger: '#B3261E',
      },
      fontFamily: {
        heading: ['"Playfair Display"', 'Georgia', 'serif'],
        body: ['Inter', '"Noto Sans Bengali"', 'system-ui', 'sans-serif'],
        bangla: ['"Hind Siliguri"', '"Noto Sans Bengali"', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 10px 30px -12px rgba(35,75,53,0.25)',
        card: '0 2px 12px rgba(35,75,53,0.08)',
      },
      borderRadius: { xl2: '1.25rem' },
    },
  },
  plugins: [],
};
