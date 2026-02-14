/**
 * Visualization Service with Observable Plot
 * Creates publication-quality charts for data analysis
 */

import * as Plot from '@observablehq/plot';
import type { ChartConfig, ChartType } from '$lib/types';

// ============================================================================
// Chart Configuration Types
// ============================================================================

export interface PlotOptions {
	width?: number;
	height?: number;
	marginTop?: number;
	marginRight?: number;
	marginBottom?: number;
	marginLeft?: number;
	grid?: boolean;
	title?: string;
	subtitle?: string;
	caption?: string;
	colorScheme?: string;
}

export interface PlotResult {
	element: SVGElement | HTMLElement;
	description: string;
}

// ============================================================================
// Visualization Service
// ============================================================================

export class VisualizationService {
	private defaultOptions: PlotOptions = {
		width: 640,
		height: 400,
		marginTop: 40,
		marginRight: 20,
		marginBottom: 40,
		marginLeft: 60,
		grid: true
	};

	// ============================================================================
	// Main Chart Creation
	// ============================================================================

	createChart(config: ChartConfig, options: PlotOptions = {}): PlotResult {
		const opts = { ...this.defaultOptions, ...options };

		switch (config.type) {
			case 'line':
				return this.createLineChart(config, opts);
			case 'bar':
				return this.createBarChart(config, opts);
			case 'scatter':
				return this.createScatterChart(config, opts);
			case 'histogram':
				return this.createHistogram(config, opts);
			case 'boxplot':
				return this.createBoxPlot(config, opts);
			case 'area':
				return this.createAreaChart(config, opts);
			case 'pie':
				return this.createPieChart(config, opts);
			default:
				throw new Error(`Unsupported chart type: ${config.type}`);
		}
	}

	// ============================================================================
	// Line Chart
	// ============================================================================

	private createLineChart(config: ChartConfig, options: PlotOptions): PlotResult {
		const marks: Plot.Markish[] = [];

		// Line
		marks.push(
			Plot.lineY(config.data, {
				x: config.x,
				y: config.y!,
				stroke: config.color || 'steelblue',
				strokeWidth: 2
			})
		);

		// Points
		marks.push(
			Plot.dot(config.data, {
				x: config.x,
				y: config.y!,
				fill: config.color || 'steelblue',
				r: 3
			})
		);

		const element = Plot.plot({
			...this.buildPlotOptions(options, config.title),
			marks,
			x: { label: config.x },
			y: { label: config.y, grid: options.grid }
		});

		return {
			element,
			description: this.generateDescription('line', config)
		};
	}

	// ============================================================================
	// Bar Chart
	// ============================================================================

	private createBarChart(config: ChartConfig, options: PlotOptions): PlotResult {
		const marks: Plot.Markish[] = [];

		marks.push(
			Plot.barY(config.data, {
				x: config.x,
				y: config.y!,
				fill: config.color || 'steelblue',
				tip: true
			})
		);

		marks.push(Plot.ruleY([0]));

		const element = Plot.plot({
			...this.buildPlotOptions(options, config.title),
			marks,
			x: { label: config.x, tickRotate: -45 },
			y: { label: config.y, grid: options.grid }
		});

		return {
			element,
			description: this.generateDescription('bar', config)
		};
	}

	// ============================================================================
	// Scatter Plot
	// ============================================================================

	private createScatterChart(config: ChartConfig, options: PlotOptions): PlotResult {
		const marks: Plot.Markish[] = [];

		marks.push(
			Plot.dot(config.data, {
				x: config.x,
				y: config.y!,
				fill: config.color || 'steelblue',
				r: 4,
				opacity: 0.7,
				tip: true
			})
		);

		const element = Plot.plot({
			...this.buildPlotOptions(options, config.title),
			marks,
			x: { label: config.x, grid: options.grid },
			y: { label: config.y, grid: options.grid }
		});

		return {
			element,
			description: this.generateDescription('scatter', config)
		};
	}

	// ============================================================================
	// Histogram
	// ============================================================================

	private createHistogram(config: ChartConfig, options: PlotOptions): PlotResult {
		const marks: Plot.Markish[] = [];

		marks.push(
			Plot.rectY(
				config.data,
				Plot.binX({ y: 'count' }, { x: config.x, fill: config.color || 'steelblue', tip: true })
			)
		);

		marks.push(Plot.ruleY([0]));

		const element = Plot.plot({
			...this.buildPlotOptions(options, config.title),
			marks,
			x: { label: config.x },
			y: { label: 'Count', grid: options.grid }
		});

		return {
			element,
			description: this.generateDescription('histogram', config)
		};
	}

	// ============================================================================
	// Box Plot
	// ============================================================================

	private createBoxPlot(config: ChartConfig, options: PlotOptions): PlotResult {
		const marks: Plot.Markish[] = [];

		if (config.y) {
			marks.push(
				Plot.boxY(config.data, {
					x: config.x,
					y: config.y,
					fill: config.color || 'steelblue'
				})
			);
		} else {
			marks.push(
				Plot.boxX(config.data, {
					x: config.x,
					fill: config.color || 'steelblue'
				})
			);
		}

		const element = Plot.plot({
			...this.buildPlotOptions(options, config.title),
			marks,
			x: { label: config.x },
			y: config.y ? { label: config.y, grid: options.grid } : undefined
		});

		return {
			element,
			description: this.generateDescription('boxplot', config)
		};
	}

	// ============================================================================
	// Area Chart
	// ============================================================================

	private createAreaChart(config: ChartConfig, options: PlotOptions): PlotResult {
		const marks: Plot.Markish[] = [];

		marks.push(
			Plot.areaY(config.data, {
				x: config.x,
				y: config.y!,
				fill: config.color || 'steelblue',
				fillOpacity: 0.3
			})
		);

		marks.push(
			Plot.lineY(config.data, {
				x: config.x,
				y: config.y!,
				stroke: config.color || 'steelblue',
				strokeWidth: 2
			})
		);

		marks.push(Plot.ruleY([0]));

		const element = Plot.plot({
			...this.buildPlotOptions(options, config.title),
			marks,
			x: { label: config.x },
			y: { label: config.y, grid: options.grid }
		});

		return {
			element,
			description: this.generateDescription('area', config)
		};
	}

	// ============================================================================
	// Pie Chart (using Observable Plot's arc)
	// ============================================================================

	private createPieChart(config: ChartConfig, options: PlotOptions): PlotResult {
		// Compute percentages
		const total = config.data.reduce(
			(sum, d) => sum + (Number(d[config.y!]) || 0),
			0
		);

		let angle = 0;
		const pieData = config.data.map((d) => {
			const value = Number(d[config.y!]) || 0;
			const startAngle = angle;
			angle += (value / total) * 2 * Math.PI;
			return {
				...d,
				startAngle,
				endAngle: angle,
				value,
				percentage: ((value / total) * 100).toFixed(1)
			};
		});

		// Create a simple representation using bars in polar-like arrangement
		const element = Plot.plot({
			...this.buildPlotOptions(options, config.title),
			marks: [
				Plot.barY(pieData, {
					x: config.x,
					y: 'value',
					fill: config.x,
					tip: true
				}),
				Plot.ruleY([0])
			],
			x: { label: config.x },
			y: { label: config.y, grid: options.grid },
			color: { legend: true }
		});

		return {
			element,
			description: this.generateDescription('pie', config)
		};
	}

	// ============================================================================
	// Specialized Charts
	// ============================================================================

	createTimeSeriesChart(
		data: Record<string, unknown>[],
		dateColumn: string,
		valueColumn: string,
		options: PlotOptions = {}
	): PlotResult {
		const marks: Plot.Markish[] = [];

		marks.push(
			Plot.lineY(data, {
				x: dateColumn,
				y: valueColumn,
				stroke: 'steelblue',
				strokeWidth: 2
			})
		);

		marks.push(
			Plot.dot(data, {
				x: dateColumn,
				y: valueColumn,
				fill: 'steelblue',
				r: 3,
				tip: true
			})
		);

		const element = Plot.plot({
			...this.buildPlotOptions(options, options.title || `${valueColumn} over time`),
			marks,
			x: { type: 'utc', label: dateColumn },
			y: { label: valueColumn, grid: true }
		});

		return {
			element,
			description: `Time series chart showing ${valueColumn} over ${dateColumn}. Contains ${data.length} data points.`
		};
	}

	createCorrelationMatrix(
		matrix: number[][],
		labels: string[],
		options: PlotOptions = {}
	): PlotResult {
		// Flatten matrix for heatmap
		const data: { x: string; y: string; value: number }[] = [];
		for (let i = 0; i < labels.length; i++) {
			for (let j = 0; j < labels.length; j++) {
				data.push({
					x: labels[j],
					y: labels[i],
					value: matrix[i][j]
				});
			}
		}

		const element = Plot.plot({
			...this.buildPlotOptions(options, options.title || 'Correlation Matrix'),
			marks: [
				Plot.cell(data, {
					x: 'x',
					y: 'y',
					fill: 'value',
					tip: true
				}),
				Plot.text(data, {
					x: 'x',
					y: 'y',
					text: (d) => d.value.toFixed(2),
					fill: (d) => (Math.abs(d.value) > 0.5 ? 'white' : 'black')
				})
			],
			color: {
				type: 'diverging',
				scheme: 'RdBu',
				domain: [-1, 1],
				legend: true
			},
			x: { tickRotate: -45 },
			aspectRatio: 1
		});

		return {
			element,
			description: `Correlation matrix heatmap showing relationships between ${labels.length} variables.`
		};
	}

	// ============================================================================
	// Helpers
	// ============================================================================

	private buildPlotOptions(
		options: PlotOptions,
		title?: string
	): Partial<Plot.PlotOptions> {
		return {
			width: options.width,
			height: options.height,
			marginTop: options.marginTop,
			marginRight: options.marginRight,
			marginBottom: options.marginBottom,
			marginLeft: options.marginLeft,
			title: title || options.title,
			subtitle: options.subtitle,
			caption: options.caption,
			style: { background: 'transparent' }
		};
	}

	private generateDescription(type: ChartType, config: ChartConfig): string {
		const dataCount = config.data.length;

		switch (type) {
			case 'line':
				return `Line chart showing ${config.y} by ${config.x}. Contains ${dataCount} data points.`;
			case 'bar':
				return `Bar chart showing ${config.y} for each ${config.x}. Contains ${dataCount} bars.`;
			case 'scatter':
				return `Scatter plot showing relationship between ${config.x} and ${config.y}. Contains ${dataCount} points.`;
			case 'histogram':
				return `Histogram showing distribution of ${config.x}. Based on ${dataCount} values.`;
			case 'boxplot':
				return `Box plot showing distribution of ${config.x}${config.y ? ` grouped by ${config.y}` : ''}. Based on ${dataCount} values.`;
			case 'area':
				return `Area chart showing ${config.y} by ${config.x}. Contains ${dataCount} data points.`;
			case 'pie':
				return `Pie chart showing proportions of ${config.y} by ${config.x}. Contains ${dataCount} segments.`;
			default:
				return `Chart showing ${dataCount} data points.`;
		}
	}

	// ============================================================================
	// Export
	// ============================================================================

	exportSVG(element: SVGElement | HTMLElement): string {
		if (element instanceof SVGElement) {
			return new XMLSerializer().serializeToString(element);
		}

		const svg = element.querySelector('svg');
		if (svg) {
			return new XMLSerializer().serializeToString(svg);
		}

		throw new Error('No SVG element found');
	}

	exportPNG(element: SVGElement | HTMLElement, scale: number = 2): Promise<Blob> {
		return new Promise((resolve, reject) => {
			const svg = element instanceof SVGElement ? element : element.querySelector('svg');
			if (!svg) {
				reject(new Error('No SVG element found'));
				return;
			}

			const svgString = new XMLSerializer().serializeToString(svg);
			const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
			const url = URL.createObjectURL(svgBlob);

			const img = new Image();
			img.onload = () => {
				const canvas = document.createElement('canvas');
				canvas.width = svg.clientWidth * scale;
				canvas.height = svg.clientHeight * scale;

				const ctx = canvas.getContext('2d')!;
				ctx.scale(scale, scale);
				ctx.drawImage(img, 0, 0);

				URL.revokeObjectURL(url);

				canvas.toBlob((blob) => {
					if (blob) {
						resolve(blob);
					} else {
						reject(new Error('Failed to create PNG'));
					}
				}, 'image/png');
			};
			img.onerror = () => {
				URL.revokeObjectURL(url);
				reject(new Error('Failed to load SVG'));
			};
			img.src = url;
		});
	}
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: VisualizationService | null = null;

export function getVisualizationService(): VisualizationService {
	if (!instance) {
		instance = new VisualizationService();
	}
	return instance;
}
