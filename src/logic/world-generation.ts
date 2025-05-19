import { interpolate } from "./math/util.ts";
import { Line, Vec2, Vec2Like } from "./math/vec.ts";
import { createLcg } from "./pseudorandom.ts";
import { World } from "./world.ts";

export function generateFractalBoxWorld(seed: number) {
	const lcg = createLcg(seed);
	const fractalWall = (
		start: Vec2Like,
		end: Vec2Like,
		depth: number
	): Line[] => {
		if (depth === 0) {
			return [[start, end]];
		}
		const ragged = lcg.nextFloat() < 0.2;
		const mid = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2] as Vec2Like;
		const wallLength = Math.sqrt(
			(end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2
		);
		const angle = lcg.nextFloat() * Math.PI * 2;
		const length = lcg.nextFloat() * wallLength * (ragged ? 0.1 : 0.5);
		const offset = [
			Math.cos(angle) * length,
			Math.sin(angle) * length,
		] as Vec2Like;
		const newStart = Vec2.add(mid, offset);
		const newEnd = Vec2.sub(mid, offset);
		if (ragged) {
			return [
				...fractalWall(start, newStart, depth - 1),
				...fractalWall(newStart, newEnd, depth - 1),
				...fractalWall(newEnd, end, depth - 1),
			];
		} else {
			return [
				...fractalWall(start, newStart, depth - 1),
				...fractalWall(newStart, end, depth - 1),
			];
		}
	};
	const size = 500;
	const walls: Line[] = [];
	walls.push(
		...fractalWall([-100, -250], [size - 100, -250], 4),
		...fractalWall([size - 100, -250], [size - 100, size - 250], 4),
		...fractalWall([size - 100, size - 250], [-100, size - 250], 4),
		...fractalWall([-100, size - 250], [-100, -250], 4)
	);
	return new World(walls);
}

export function generateGraphWorld(
	seed: number,
	nodeCount = 50,
	size = 450,
	gridStep = 20,
	threshold = 60
) {
	const { mst } = generateRandomGraph(seed, nodeCount, size - threshold - 20);
	const perlin = new PerlinNoise(seed);
	function distToGraphEdgeWithNoise(x: number, y: number) {
		let minDist = Infinity;
		const p = new Vec2([x, y]);
		for (const [p1, p2] of mst) {
			const v = p2.copy().sub(p1);
			const w = p.copy().sub(p1);
			const len2 = v.magnitudeSquared();
			const t =
				len2 === 0 ? 0 : Math.max(0, Math.min(1, Vec2.dot(w, v) / len2));
			const proj = p1.copy().add(v.copy().mul(t));
			const d = p.copy().sub(proj).magnitude();
			if (d < minDist) minDist = d;
		}
		// Add Perlin noise
		const noise = perlin.noise(x * 0.02, y * 0.02) * 30; // scale and amplitude
		return minDist + noise;
	}
	const lines = marchingSquaresFromGraph(
		distToGraphEdgeWithNoise,
		size,
		gridStep,
		threshold
	);
	return new World(lines);
}

export function generateRandomGraph(
	seed: number,
	nodeCount: number,
	size: number
) {
	const lcg = createLcg(seed);
	const nodes: Vec2[] = [new Vec2([0, 0])];
	for (let i = 1; i < nodeCount; i++) {
		const angle = lcg.nextFloat() * Math.PI * 2;
		const radius = (1 - lcg.nextFloat() ** 2) * size;
		nodes.push(new Vec2([Math.cos(angle) * radius, Math.sin(angle) * radius]));
	}

	// Kruskal's algorithm for MST
	const edges: { a: number; b: number; dist: number }[] = [];
	for (let i = 0; i < nodes.length; i++) {
		for (let j = i + 1; j < nodes.length; j++) {
			const dist = nodes[i].copy().sub(nodes[j]).magnitude();
			edges.push({ a: i, b: j, dist });
		}
	}
	edges.sort((e1, e2) => e1.dist - e2.dist);
	const parent = Array(nodes.length)
		.fill(0)
		.map((_, i) => i);
	function find(x: number): number {
		if (parent[x] !== x) parent[x] = find(parent[x]);
		return parent[x];
	}
	const mst: [Vec2, Vec2][] = [];
	for (const { a, b } of edges) {
		const pa = find(a),
			pb = find(b);
		if (pa !== pb) {
			parent[pa] = pb;
			mst.push([nodes[a], nodes[b]]);
		}
	}
	return { nodes, mst };
}

export function marchingSquaresFromGraph(
	fn: (x: number, y: number) => number,
	size: number,
	gridStep: number,
	threshold: number
) {
	const grid: number[][] = [];
	for (let gx = -size; gx <= size; gx += gridStep) {
		const row: number[] = [];
		for (let gy = -size; gy <= size; gy += gridStep) {
			let d = fn(gx, gy);
			row.push(d);
		}
		grid.push(row);
	}
	const lines: Line[] = [];
	const nx = grid.length,
		ny = grid[0].length;
	for (let i = 0; i < nx - 1; i++) {
		for (let j = 0; j < ny - 1; j++) {
			const corners: Vec2[] = [
				new Vec2([i * gridStep - size, j * gridStep - size]),
				new Vec2([(i + 1) * gridStep - size, j * gridStep - size]),
				new Vec2([(i + 1) * gridStep - size, (j + 1) * gridStep - size]),
				new Vec2([i * gridStep - size, (j + 1) * gridStep - size]),
			];
			const values = [
				grid[i][j],
				grid[i + 1][j],
				grid[i + 1][j + 1],
				grid[i][j + 1],
			];
			const edgeIndices = [
				[0, 1],
				[1, 2],
				[2, 3],
				[3, 0],
			];
			const points: Vec2[] = [];
			for (const [a, b] of edgeIndices) {
				const va = values[a],
					vb = values[b];
				if (va < threshold !== vb < threshold) {
					const t = (threshold - va) / (vb - va);
					const pa = corners[a],
						pb = corners[b];
					const interp = pa
						.copy()
						.mul(1 - t)
						.add(pb.copy().mul(t));
					points.push(interp);
				}
			}
			for (let k = 0; k + 1 < points.length; k += 2) {
				lines.push([points[k], points[k + 1]]);
			}
		}
	}
	return lines;
}

class PerlinNoise {
	private perm: number[];
	constructor(seed: number) {
		this.perm = [];
		for (let i = 0; i < 256; i++) this.perm[i] = i;
		for (let i = 255; i > 0; i--) {
			const j = Math.floor(Math.abs(Math.sin(seed + i)) * (i + 1));
			[this.perm[i], this.perm[j]] = [this.perm[j], this.perm[i]];
		}
		for (let i = 0; i < 256; i++) this.perm.push(this.perm[i]);
	}
	private fade(t: number) {
		return t * t * t * (t * (t * 6 - 15) + 10);
	}
	private grad(hash: number, x: number, y: number) {
		const h = hash & 3;
		const u = h < 2 ? x : y;
		const v = h < 2 ? y : x;
		return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
	}
	public noise(x: number, y: number) {
		const X = Math.floor(x) & 255;
		const Y = Math.floor(y) & 255;
		const xf = x - Math.floor(x);
		const yf = y - Math.floor(y);
		const u = this.fade(xf);
		const v = this.fade(yf);
		const aa = this.perm[this.perm[X] + Y];
		const ab = this.perm[this.perm[X] + Y + 1];
		const ba = this.perm[this.perm[X + 1] + Y];
		const bb = this.perm[this.perm[X + 1] + Y + 1];
		const x1 = interpolate(this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf), u);
		const x2 = interpolate(
			this.grad(ab, xf, yf - 1),
			this.grad(bb, xf - 1, yf - 1),
			u
		);
		return interpolate(x1, x2, v);
	}
}
