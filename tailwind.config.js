/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				primary: {
					50: '#e8f5e9',
					100: '#c8e6c9',
					200: '#a5d6a7',
					300: '#81c784',
					400: '#66bb6a',
					500: '#00c853',
					600: '#00b248',
					700: '#009624',
					800: '#007a1f',
					900: '#005c17'
				},
				accent: {
					50: '#ffebee',
					100: '#ffcdd2',
					200: '#ef9a9a',
					300: '#e57373',
					400: '#ef5350',
					500: '#c81400',
					600: '#b71c1c',
					700: '#a31515',
					800: '#8b0f0f',
					900: '#6d0b0b'
				}
			},
			fontFamily: {
				sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
				mono: ['JetBrains Mono', 'Fira Code', 'monospace']
			}
		}
	},
	plugins: [require('@tailwindcss/typography')]
};
