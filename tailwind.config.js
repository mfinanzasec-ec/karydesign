/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: '#232323',
        paper: '#F7F3EC',
        paperdark: '#EDE6D8',
        moss: '#5B6B4F',
        ochre: '#C68A3B',
        plum: '#5B3A4E',
        line: '#D8CFBC',
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
