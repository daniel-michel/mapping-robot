import { Grid } from "./grid.ts";
import { RotoTranslation } from "./math/roto-translation.ts";
import { Vec2 } from "./math/vec.ts";
import { RangingSensorScan } from "./robot.ts";

export type occupancyProb = {
	prob: number;
	count: number;
};
export type OccupancyProbGrid = Grid<occupancyProb>;
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
	const probabilityGrid = new Grid<occupancyProb>(2);
	for (const { scan, transform } of scans) {
		const scanOrigin = transform.apply(new Vec2([0, 0])).freeze();
		for (const { angle, point, distance } of scan.points) {
			if (!point) {
				continue;
			}
			const absolutePoint = transform.apply(point).freeze();
			plotLine(
				absolutePoint.copy().div(resolution),
				scanOrigin.copy().div(resolution)
			).forEach((point, i) => {
				const value = i === 0 ? 1 : 0;
				const gridValue = probabilityGrid.get(...point) ?? {
					prob: 0,
					count: 0,
				};
				gridValue.count += 1;
				gridValue.prob =
					(gridValue.prob * (gridValue.count - 1) + value) / gridValue.count;
				probabilityGrid.set(gridValue, ...point);
			});
		}
	}
	// return probabilityGrid;
	return probabilityGrid.map(({ prob, count }) => {
		if (count === 0) {
			return undefined;
		}
		if (prob > 0.2) {
			return 1;
		} else {
			return 0;
		}
	}) satisfies OccupancyGrid;
}

/**
 * https://en.wikipedia.org/wiki/Bresenham's_line_algorithm
 */
function* plotLine(v0: Vec2, v1: Vec2) {
	if (Math.abs(v1.y - v0.y) < Math.abs(v1.x - v0.x)) {
		yield* plotLineLow(v0, v1);
	} else {
		yield* plotLineHigh(v0, v1);
	}
}

function* plotLineLow(v0: Vec2, v1: Vec2) {
	const d = Vec2.sub(v1, v0);
	const yi = d.y < 0 ? -1 : 1;
	if (d.y < 0) {
		d.y = -d.y;
	}
	let D = 2 * d.y - d.x;
	let y = v0.y;
	if (d.x < 0) {
		d.x = -d.x;
	}

	for (const x of fromTo(v0.x, v1.x)) {
		yield new Vec2([x, y]);
		if (D > 0) {
			y = y + yi;
			D = D + 2 * (d.y - d.x);
		} else {
			D = D + 2 * d.y;
		}
	}
}

function* plotLineHigh(v0: Vec2, v1: Vec2) {
	const d = Vec2.sub(v1, v0);
	const xi = d.x < 0 ? -1 : 1;
	if (d.x < 0) {
		d.x = -d.x;
	}
	let D = 2 * d.x - d.y;
	let x = v0.x;
	if (d.y < 0) {
		d.y = -d.y;
	}

	for (const y of fromTo(v0.y, v1.y)) {
		yield new Vec2([x, y]);
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
