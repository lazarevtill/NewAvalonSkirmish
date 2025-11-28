/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./contexts/**/*.{js,ts,jsx,tsx}",
    "./hooks/**/*.{js,ts,jsx,tsx}",
    "./utils/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        'card-back': '#5A67D8',
        'card-face': '#F7FAFC',
        'board-bg': '#2D3748',
        'board-cell': '#4A5568',
        'board-cell-active': '#718096',
        'panel-bg': '#1A202C',
      }
    },
  },
  plugins: [],
}
