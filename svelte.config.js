import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: 'index.html',
			precompress: true
		}),
		paths: {
			base: process.env.BASE_PATH || ''
		},
		alias: {
			$lib: './src/lib',
			$components: './src/lib/components',
			$stores: './src/lib/stores',
			$sources: './src/lib/sources',
			$federation: './src/lib/federation',
			$analysis: './src/lib/analysis',
			$utils: './src/lib/utils'
		}
	}
};

export default config;
