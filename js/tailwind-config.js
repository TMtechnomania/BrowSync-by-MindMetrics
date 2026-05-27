// Tailwind configuration moved out of inline HTML to comply with Chrome Web Store policy
window.tailwind = window.tailwind || {};
window.tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      colors: {
        'orange-punch': '#FF6B35',
        'orange-dark': '#E85A2A',
        'grey-dark': '#1F2937',
        'grey-darker': '#111827',
        'grey-light': '#374151',
        'off-white': '#F9FAFB',
        'crimson': '#DC2626',
        'crimson-dark': '#B91C1C'
      }
    }
  }
};
