import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pitch: {
          900: "#0a1a12",
          800: "#0f2419",
          700: "#143123",
        },
      },
    },
  },
  plugins: [],
};

export default config;
