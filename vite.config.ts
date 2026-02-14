import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	optimizeDeps: {
		exclude: ['@duckdb/duckdb-wasm']
	},
	worker: {
		format: 'es'
	},
	build: {
		target: 'esnext'
	},
	server: {
		fs: {
			allow: ['..']
		}
	}
});
