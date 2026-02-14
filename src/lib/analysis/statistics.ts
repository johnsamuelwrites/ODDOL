/**
 * Statistics Library
 * Streaming statistics and common statistical functions
 */

import {
	mean,
	median,
	mode,
	standardDeviation,
	variance,
	min,
	max,
	sum,
	quantile,
	sampleCorrelation,
	linearRegression,
	rSquared
} from 'simple-statistics';

// ============================================================================
// Streaming Statistics
// ============================================================================

export interface StreamingStats {
	count: number;
	sum: number;
	mean: number;
	m2: number; // For Welford's online variance
	min: number;
	max: number;
}

export function createStreamingStats(): StreamingStats {
	return {
		count: 0,
		sum: 0,
		mean: 0,
		m2: 0,
		min: Infinity,
		max: -Infinity
	};
}

/**
 * Update streaming statistics with a new value (Welford's algorithm)
 */
export function updateStreamingStats(stats: StreamingStats, value: number): StreamingStats {
	const count = stats.count + 1;
	const delta = value - stats.mean;
	const mean = stats.mean + delta / count;
	const delta2 = value - mean;
	const m2 = stats.m2 + delta * delta2;

	return {
		count,
		sum: stats.sum + value,
		mean,
		m2,
		min: Math.min(stats.min, value),
		max: Math.max(stats.max, value)
	};
}

/**
 * Merge two streaming statistics objects
 */
export function mergeStreamingStats(a: StreamingStats, b: StreamingStats): StreamingStats {
	if (a.count === 0) return b;
	if (b.count === 0) return a;

	const count = a.count + b.count;
	const delta = b.mean - a.mean;
	const mean = a.mean + (delta * b.count) / count;
	const m2 = a.m2 + b.m2 + (delta * delta * a.count * b.count) / count;

	return {
		count,
		sum: a.sum + b.sum,
		mean,
		m2,
		min: Math.min(a.min, b.min),
		max: Math.max(a.max, b.max)
	};
}

/**
 * Get variance from streaming stats
 */
export function getVariance(stats: StreamingStats): number {
	if (stats.count < 2) return 0;
	return stats.m2 / (stats.count - 1);
}

/**
 * Get standard deviation from streaming stats
 */
export function getStdDev(stats: StreamingStats): number {
	return Math.sqrt(getVariance(stats));
}

// ============================================================================
// Descriptive Statistics
// ============================================================================

export interface DescriptiveStats {
	count: number;
	min: number;
	max: number;
	sum: number;
	mean: number;
	median: number;
	mode: number[];
	variance: number;
	stdDev: number;
	q1: number;
	q3: number;
	iqr: number;
	skewness: number;
	kurtosis: number;
}

export function computeDescriptiveStats(values: number[]): DescriptiveStats {
	if (values.length === 0) {
		throw new Error('Cannot compute statistics for empty array');
	}

	const sorted = [...values].sort((a, b) => a - b);
	const n = values.length;

	const meanVal = mean(values);
	const medianVal = median(sorted);
	const modeVal = mode(values);
	const varianceVal = variance(values);
	const stdDevVal = standardDeviation(values);
	const q1 = quantile(sorted, 0.25);
	const q3 = quantile(sorted, 0.75);

	// Skewness (Fisher's)
	const m3 = values.reduce((acc, x) => acc + Math.pow(x - meanVal, 3), 0) / n;
	const skewness = m3 / Math.pow(stdDevVal, 3);

	// Kurtosis (excess)
	const m4 = values.reduce((acc, x) => acc + Math.pow(x - meanVal, 4), 0) / n;
	const kurtosis = m4 / Math.pow(stdDevVal, 4) - 3;

	return {
		count: n,
		min: min(values),
		max: max(values),
		sum: sum(values),
		mean: meanVal,
		median: medianVal,
		mode: Array.isArray(modeVal) ? modeVal : [modeVal],
		variance: varianceVal,
		stdDev: stdDevVal,
		q1,
		q3,
		iqr: q3 - q1,
		skewness,
		kurtosis
	};
}

// ============================================================================
// Correlation Analysis
// ============================================================================

export interface CorrelationResult {
	correlation: number;
	pValue: number;
	significant: boolean;
}

export function computeCorrelation(x: number[], y: number[]): CorrelationResult {
	if (x.length !== y.length) {
		throw new Error('Arrays must have the same length');
	}

	const r = sampleCorrelation(x, y);
	const n = x.length;

	// t-statistic for correlation
	const t = r * Math.sqrt((n - 2) / (1 - r * r));

	// Approximate p-value (two-tailed)
	const pValue = 2 * (1 - tDistributionCDF(Math.abs(t), n - 2));

	return {
		correlation: r,
		pValue,
		significant: pValue < 0.05
	};
}

export function computeCorrelationMatrix(
	data: Record<string, number[]>,
	columns: string[]
): number[][] {
	const matrix: number[][] = [];

	for (let i = 0; i < columns.length; i++) {
		matrix[i] = [];
		for (let j = 0; j < columns.length; j++) {
			if (i === j) {
				matrix[i][j] = 1;
			} else if (j < i) {
				matrix[i][j] = matrix[j][i];
			} else {
				matrix[i][j] = sampleCorrelation(data[columns[i]], data[columns[j]]);
			}
		}
	}

	return matrix;
}

// ============================================================================
// Regression Analysis
// ============================================================================

export interface RegressionResult {
	slope: number;
	intercept: number;
	rSquared: number;
	predicted: number[];
	residuals: number[];
}

export function computeLinearRegression(x: number[], y: number[]): RegressionResult {
	if (x.length !== y.length) {
		throw new Error('Arrays must have the same length');
	}

	const points = x.map((xi, i) => [xi, y[i]]);
	const regression = linearRegression(points);
	const r2 = rSquared(points, (xi) => regression.m * xi + regression.b);

	const predicted = x.map((xi) => regression.m * xi + regression.b);
	const residuals = y.map((yi, i) => yi - predicted[i]);

	return {
		slope: regression.m,
		intercept: regression.b,
		rSquared: r2,
		predicted,
		residuals
	};
}

// ============================================================================
// Histogram / Binning
// ============================================================================

export interface Bin {
	start: number;
	end: number;
	count: number;
	frequency: number;
}

export function computeHistogram(values: number[], numBins: number = 10): Bin[] {
	if (values.length === 0) return [];

	const minVal = min(values);
	const maxVal = max(values);
	const range = maxVal - minVal || 1;
	const binWidth = range / numBins;

	const bins: Bin[] = [];

	for (let i = 0; i < numBins; i++) {
		bins.push({
			start: minVal + i * binWidth,
			end: minVal + (i + 1) * binWidth,
			count: 0,
			frequency: 0
		});
	}

	for (const value of values) {
		const binIndex = Math.min(Math.floor((value - minVal) / binWidth), numBins - 1);
		bins[binIndex].count++;
	}

	const total = values.length;
	for (const bin of bins) {
		bin.frequency = bin.count / total;
	}

	return bins;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Approximation of t-distribution CDF using normal approximation
 */
function tDistributionCDF(t: number, df: number): number {
	// For large df, t approaches normal distribution
	if (df > 30) {
		return normalCDF(t);
	}

	// Use approximation
	const x = df / (df + t * t);
	return 1 - 0.5 * incompleteBeta(df / 2, 0.5, x);
}

/**
 * Standard normal CDF approximation
 */
function normalCDF(x: number): number {
	const a1 = 0.254829592;
	const a2 = -0.284496736;
	const a3 = 1.421413741;
	const a4 = -1.453152027;
	const a5 = 1.061405429;
	const p = 0.3275911;

	const sign = x < 0 ? -1 : 1;
	x = Math.abs(x) / Math.sqrt(2);

	const t = 1.0 / (1.0 + p * x);
	const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

	return 0.5 * (1.0 + sign * y);
}

/**
 * Incomplete beta function approximation
 */
function incompleteBeta(a: number, b: number, x: number): number {
	// Simple approximation for small values
	if (x === 0) return 0;
	if (x === 1) return 1;

	const bt =
		x === 0 || x === 1
			? 0
			: Math.exp(
					logGamma(a + b) -
						logGamma(a) -
						logGamma(b) +
						a * Math.log(x) +
						b * Math.log(1 - x)
				);

	if (x < (a + 1) / (a + b + 2)) {
		return (bt * betaCF(a, b, x)) / a;
	} else {
		return 1 - (bt * betaCF(b, a, 1 - x)) / b;
	}
}

/**
 * Continued fraction for beta function
 */
function betaCF(a: number, b: number, x: number): number {
	const MAXIT = 100;
	const EPS = 3e-7;

	let qab = a + b;
	let qap = a + 1;
	let qam = a - 1;
	let c = 1;
	let d = 1 - (qab * x) / qap;
	if (Math.abs(d) < 1e-30) d = 1e-30;
	d = 1 / d;
	let h = d;

	for (let m = 1; m <= MAXIT; m++) {
		let m2 = 2 * m;
		let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
		d = 1 + aa * d;
		if (Math.abs(d) < 1e-30) d = 1e-30;
		c = 1 + aa / c;
		if (Math.abs(c) < 1e-30) c = 1e-30;
		d = 1 / d;
		h *= d * c;
		aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
		d = 1 + aa * d;
		if (Math.abs(d) < 1e-30) d = 1e-30;
		c = 1 + aa / c;
		if (Math.abs(c) < 1e-30) c = 1e-30;
		d = 1 / d;
		const del = d * c;
		h *= del;
		if (Math.abs(del - 1) < EPS) break;
	}

	return h;
}

/**
 * Log gamma function approximation (Stirling's)
 */
function logGamma(x: number): number {
	const cof = [
		76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
		0.1208650973866179e-2, -0.5395239384953e-5
	];

	let y = x;
	let tmp = x + 5.5;
	tmp -= (x + 0.5) * Math.log(tmp);
	let ser = 1.000000000190015;

	for (let j = 0; j < 6; j++) {
		ser += cof[j] / ++y;
	}

	return -tmp + Math.log((2.5066282746310005 * ser) / x);
}
