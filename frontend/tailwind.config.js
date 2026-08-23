/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html",
  ],
  theme: {
    extend: {
      colors: {
        primary: "hsl(210, 50%, 45%)",
        accent: "hsl(260, 80%, 60%)",
        success: "hsl(120, 60%, 45%)",
        danger: "hsl(0, 70%, 45%)",
      },
    },
  },
  plugins: [],
};
