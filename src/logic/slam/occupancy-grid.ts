import { Grid } from "../data-structures/grid.ts";
import { RotoTranslation } from "../math/roto-translation.ts";
import { clamp } from "../math/util.ts";
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

self.addEventListener("message", (e: MessageEvent) => {
	switch (e.data.action) {
		case "generateOccupancyGrid": {
			const result = generateOccupancyGrid(
				e.data.scans.map(
					(scanWithTransform: {
						scan: RangingSensorScan;
						transform: RotoTranslation;
					}) => ({
						scan: {
							points: scanWithTransform.scan.points.map((p) => ({
								...p,
								point: p.point
									? new Vec(p.point as unknown as [number, number])
									: p.point,
							})),
						},
						transform: new RotoTranslation(
							...(scanWithTransform.transform as unknown as [
								number,
								[number, number]
							])
						),
					})
				),
				e.data.resolution
			);
			self.postMessage({
				grid: result.serialize(),
				level: result.level,
			});
			break;
		}
	}
});

export async function asyncGenerateOccupancyGrid(
	scans: {
		scan: RangingSensorScan;
		transform: RotoTranslation;
	}[],
	resolution: number = 0.3
): Promise<Grid<OccupancyProb>> {
	const MAX_THREADS = navigator.hardwareConcurrency;
	const MIN_BATCH_SIZE = 4;

	if (scans.length === 0) {
		return new Grid(2);
	}
	const threads = clamp(Math.floor(scans.length / MIN_BATCH_SIZE), [
		1,
		MAX_THREADS,
	]);

	const batches = [];
	const remainingScans = scans.slice();

	for (let i = 0; i < threads; i++) {
		const count = Math.round(remainingScans.length / (threads - i));
		batches.push(remainingScans.splice(0, count));
	}

	const batchResults = await Promise.all(
		batches.map((batch) => asyncGenerateOccupancyGridBatch(batch, resolution))
	);

	console.log(
		batchResults,
		batchResults.map((g) => g.grid.level)
	);

	const mergedResult: Grid<OccupancyProb> = Grid.merge(
		batchResults.map((b) => b.grid),
		(values) => {
			const totalWeight = values.reduce((acc, v) => acc + (v?.weight ?? 0), 0);
			return {
				prob:
					values.reduce((acc, v) => acc + (v ? v.prob * v.weight : 0), 0) /
					totalWeight,
				weight: totalWeight,
			} satisfies OccupancyProb;
		}
	);

	return mergedResult;
}
export function asyncGenerateOccupancyGridBatch(
	batch: {
		scan: RangingSensorScan;
		transform: RotoTranslation;
	}[],
	resolution: number
) {
	return new Promise<{
		grid: Grid<OccupancyProb>;
	}>((resolve) => {
		const worker = new Worker(new URL("./occupancy-grid.js", import.meta.url), {
			type: "module",
		});
		worker.addEventListener("message", (e) => {
			worker.terminate();
			resolve({
				grid: Grid.fromSerialized(e.data.grid, 2, e.data.level),
			});
		});
		worker.postMessage({
			action: "generateOccupancyGrid",
			scans: batch.map((scanWithTransform) => ({
				scan: {
					...scanWithTransform.scan,
					points: scanWithTransform.scan.points.map((p) => ({
						...p,
						point: p.point ? [...p.point] : null,
					})),
				},
				transform: [
					scanWithTransform.transform.rotation,
					[...scanWithTransform.transform.translation],
				],
			})),
			resolution,
		});
	});
}

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
				addWeightedToProbabilityGrid(
					probabilityGrid,
					point,
					value,
					// 10 / (i + 10)
					0.5
				);
				// const dilution =
				// 	0.5 + Vec.distance(point, scanOrigin.copy().div(resolution)) * 0.05;
				// addToProbabilityGridDiluted(probabilityGrid, point, value, dilution);
			});
		}
	}
	return probabilityGrid;
}

export function toBinaryOccupancyGrid(
	probabilityGrid: OccupancyProbGrid
): OccupancyGrid {
	return probabilityGrid.map(({ prob, weight }) => {
		if (weight < 2) {
			return undefined;
		}
		if (prob > 0.2) {
			return 1;
		} else {
			return 0;
		}
	}) satisfies OccupancyGrid;
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
