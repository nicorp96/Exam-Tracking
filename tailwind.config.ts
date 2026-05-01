import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        mist: "#f6f8fb",
        line: "#d9e2ee",
        spruce: "#0f766e",
        amber: "#b7791f",
        berry: "#be185d",
      },
      boxShadow: {
        soft: "0 10px 30px rgba(23, 32, 51, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
