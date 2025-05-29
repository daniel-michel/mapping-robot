import { Grid } from "../data-structures/grid.ts";
import { RotoTranslation } from "../math/roto-translation.ts";
import { Vec } from "../math/vec.ts";
import { RangingSensorScan } from "../robot/robot.ts";

export type OccupancyProb = {
	prob: number;
	weight: number;
};
export type OccupancyProbGrid = Grid<OccupancyProb>;
/** 0 = free, 1 = occupied, undefined = unknown */
export type OccupancyBin = 0 | 1;
export type OccupancyGrid = Grid<OccupancyBin>;

export function generateOccupancyGrid(
	scans: {
		scan: RangingSensorScan;
		transform: RotoTranslation;
	}[],
	resolution: number = 0.3
) {
	const probabilityGrid = new Grid<OccupancyProb>(2);
	for (const { scan, transform } of scans) {
		const scanOrigin = transform.apply(new Vec([0, 0])).freeze();
		for (const { point } of scan.points) {
			if (!point) {
				continue;
			}
			const absolutePoint = transform.apply(point).freeze();
			plotLine(
				absolutePoint.copy().div(resolution),
				scanOrigin.copy().div(resolution)
			).forEach((point, i) => {
				const value = i === 0 ? 1 : 0;
				const dilution =
					0.5 + Vec.distance(point, scanOrigin.copy().div(resolution)) * 0.05;
				addToProbabilityGridDiluted(probabilityGrid, point, value, dilution);
			});
		}
	}
	return probabilityGrid;
}

export function toBinaryOccupancyGrid(
	probabilityGrid: OccupancyProbGrid
): OccupancyGrid {
	return probabilityGrid.map(({ prob, weight }) => {
		if (weight < 1) {
			return undefined;
		}
		if (prob > 0.2) {
			return 1;
		} else {
			return 0;
		}
	}) satisfies OccupancyGrid;
}

function addToProbabilityGridDiluted(
	probabilityGrid: OccupancyProbGrid,
	point: Vec,
	value: number,
	radius: number
) {
	const offset = Math.round(radius);

	const start = point.copy().sub([offset, offset]);
	const end = point.copy().add([offset, offset]);

	// 1. Collect all weights and positions
	const positions: { pos: Vec; weight: number }[] = [];
	let totalWeight = 0;

	for (let x = start.x; x <= end.x; x++) {
		const xGaussian = gaussian(x, point.x, (radius + 0.1) * 0.7);
		for (let y = start.y; y <= end.y; y++) {
			const yGaussian = gaussian(y, point.y, (radius + 0.1) * 0.7);
			const weight = xGaussian * yGaussian;
			if (weight < 0.01) continue;
			const pos = new Vec([x, y]);
			positions.push({ pos, weight });
			totalWeight += weight;
		}
	}

	const normalizationFactor = 1 / totalWeight;

	// 2. Normalize and add to grid
	for (const { pos, weight } of positions) {
		const normalizedWeight = weight * normalizationFactor;
		addWeightedToProbabilityGrid(probabilityGrid, pos, value, normalizedWeight);
	}
}

function gaussian(x: number, mean: number, stddev: number): number {
	const coeff = 1 / (stddev * Math.sqrt(2 * Math.PI));
	const exponent = -((x - mean) ** 2) / (2 * stddev ** 2);
	return coeff * Math.exp(exponent);
}

function addWeightedToProbabilityGrid(
	probabilityGrid: OccupancyProbGrid,
	point: Vec,
	value: number,
	weight: number
) {
	const gridValue = probabilityGrid.get(new Vec(point.vec)) ?? {
		prob: 0,
		weight: 0,
	};
	gridValue.weight += weight;
	gridValue.prob =
		(gridValue.prob * (gridValue.weight - weight) + value * weight) /
		gridValue.weight;
	probabilityGrid.set(new Vec(point.vec), gridValue);
	return gridValue;
}

/**
 * https://en.wikipedia.org/wiki/Bresenham's_line_algorithm
 */
function* plotLine(v0: Vec, v1: Vec) {
	if (Math.abs(v1.y - v0.y) < Math.abs(v1.x - v0.x)) {
		yield* plotLineLow(v0, v1);
	} else {
		yield* plotLineHigh(v0, v1);
	}
}

function* plotLineLow(v0: Vec, v1: Vec) {
	const d = Vec.sub(v1, v0);
	const yi = d.y < 0 ? -1 : 1;
	if (d.y < 0) {
		d.y = -d.y;
	}
	if (d.x < 0) {
		d.x = -d.x;
	}
	let D = 2 * d.y - d.x;
	let y = v0.y;

	for (const x of fromTo(v0.x, v1.x)) {
		yield new Vec([x, y]);
		if (D > 0) {
			y = y + yi;
			D = D + 2 * (d.y - d.x);
		} else {
			D = D + 2 * d.y;
		}
	}
}

function* plotLineHigh(v0: Vec, v1: Vec) {
	const d = Vec.sub(v1, v0);
	const xi = d.x < 0 ? -1 : 1;
	if (d.x < 0) {
		d.x = -d.x;
	}
	if (d.y < 0) {
		d.y = -d.y;
	}
	let D = 2 * d.x - d.y;
	let x = v0.x;

	for (const y of fromTo(v0.y, v1.y)) {
		yield new Vec([x, y]);
		if (D > 0) {
			x = x + xi;
			D = D + 2 * (d.x - d.y);
		} else {
			D = D + 2 * d.x;
		}
	}
}

function* fromTo(from: number, to: number) {
	if (from < to) {
		for (let i = from; i <= to; i++) {
			yield i;
		}
	} else {
		for (let i = from; i >= to; i--) {
			yield i;
		}
	}
}
