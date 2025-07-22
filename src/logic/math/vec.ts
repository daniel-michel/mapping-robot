import { assert } from "../assert.ts";
import { clamp } from "./util.ts";

export type VecLike = Vec | number[];

export class Vec {
	vec: number[];

	constructor(vec: number[]) {
		this.vec = vec;
	}

	get x(): number {
		return this.vec[0];
	}
	get y(): number {
		return this.vec[1];
	}
	get z(): number {
		return this.vec[2];
	}
	get w(): number {
		return this.vec[3];
	}
	set x(value: number) {
		this.vec[0] = value;
	}
	set y(value: number) {
		this.vec[1] = value;
	}
	set z(value: number) {
		this.vec[2] = value;
	}
	set w(value: number) {
		this.vec[3] = value;
	}

	get dimensions(): number {
		return this.vec.length;
	}

	at(index: number): number {
		assert(
			index >= -this.vec.length && index < this.vec.length,
			"Index out of bounds"
		);
		if (index < 0) {
			index += this.vec.length; // Allow negative indexing
		}
		return this.vec[index];
	}

	copy() {
		return new Vec(this.vec.slice());
	}

	freeze() {
		Object.freeze(this.vec);
		return Object.freeze(this);
	}
	set(vec: VecLike) {
		const arr = Vec.unwrapped(vec);
		assert(arr.length === this.vec.length);
		for (let i = 0; i < this.vec.length; i++) {
			this.vec[i] = arr[i];
		}
	}
	add(other: number | VecLike) {
		if (typeof other === "number") {
			for (let i = 0; i < this.vec.length; i++) {
				this.vec[i] += other;
			}
			return this;
		} else {
			const arr = Vec.unwrapped(other);
			assert(arr.length === this.vec.length);
			for (let i = 0; i < this.vec.length; i++) {
				this.vec[i] += arr[i];
			}
			return this;
		}
	}
	sub(other: number | VecLike) {
		if (typeof other === "number") {
			for (let i = 0; i < this.vec.length; i++) {
				this.vec[i] -= other;
			}
			return this;
		} else {
			const arr = Vec.unwrapped(other);
			assert(arr.length === this.vec.length);
			for (let i = 0; i < this.vec.length; i++) {
				this.vec[i] -= arr[i];
			}
			return this;
		}
	}
	mul(s: number | VecLike) {
		if (typeof s === "number") {
			for (let i = 0; i < this.vec.length; i++) {
				this.vec[i] *= s;
			}
		} else {
			const arr = Vec.unwrapped(s);
			assert(arr.length === this.vec.length);
			for (let i = 0; i < this.vec.length; i++) {
				this.vec[i] *= arr[i];
			}
		}
		return this;
	}
	div(s: number | VecLike) {
		if (typeof s === "number") {
			for (let i = 0; i < this.vec.length; i++) {
				this.vec[i] /= s;
			}
		} else {
			const arr = Vec.unwrapped(s);
			assert(arr.length === this.vec.length);
			for (let i = 0; i < this.vec.length; i++) {
				this.vec[i] /= arr[i];
			}
		}
		return this;
	}
	modify(fn: (value: number, index: number) => number) {
		for (let i = 0; i < this.vec.length; i++) {
			this.vec[i] = fn(this.vec[i], i);
		}
		return this;
	}
	toMapped(fn: (value: number, index: number) => number): Vec {
		return new Vec(this.vec.map(fn));
	}
	normalize() {
		const length = this.magnitude();
		if (length !== 0) {
			this.mul(1 / length);
		}
		return this;
	}
	magnitude() {
		return Math.sqrt(this.magnitudeSquared());
	}
	magnitudeSquared() {
		let sum = 0;
		for (let i = 0; i < this.vec.length; i++) {
			sum += this.vec[i] * this.vec[i];
		}
		return sum;
	}
	round() {
		for (let i = 0; i < this.vec.length; i++) {
			this.vec[i] = Math.round(this.vec[i]);
		}
		return this;
	}
	floor() {
		for (let i = 0; i < this.vec.length; i++) {
			this.vec[i] = Math.floor(this.vec[i]);
		}
		return this;
	}
	ceil() {
		for (let i = 0; i < this.vec.length; i++) {
			this.vec[i] = Math.ceil(this.vec[i]);
		}
		return this;
	}
	min(other: number | VecLike) {
		if (typeof other === "number") {
			for (let i = 0; i < this.vec.length; i++) {
				this.vec[i] = Math.min(this.vec[i], other);
			}
		} else {
			const arr = Vec.unwrapped(other);
			assert(arr.length === this.vec.length);
			for (let i = 0; i < this.vec.length; i++) {
				this.vec[i] = Math.min(this.vec[i], arr[i]);
			}
		}
		return this;
	}
	max(other: number | VecLike) {
		if (typeof other === "number") {
			for (let i = 0; i < this.vec.length; i++) {
				this.vec[i] = Math.max(this.vec[i], other);
			}
		} else {
			const arr = Vec.unwrapped(other);
			assert(arr.length === this.vec.length);
			for (let i = 0; i < this.vec.length; i++) {
				this.vec[i] = Math.max(this.vec[i], arr[i]);
			}
		}
		return this;
	}
	clamp(min: number | Vec, max: number | Vec) {
		return this.min(max).max(min);
	}
	/**
	 * Counter-clockwise angle from the x-axis
	 * (if the x-axis is pointing to the right and the y-axis is pointing up)
	 */
	heading2d() {
		assert(this.vec.length >= 2);
		return Math.atan2(this.y, this.x);
	}
	rotate2d(angle: number) {
		assert(this.vec.length >= 2);
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		const x = this.x * cos - this.y * sin;
		this.y = this.x * sin + this.y * cos;
		this.x = x;
		return this;
	}

	toString() {
		return `(${this.vec.join(", ")})`;
	}

	iter() {
		return this[Symbol.iterator]();
	}

	*[Symbol.iterator](): Generator<number, void, void> {
		for (const value of this.vec) {
			yield value;
		}
	}

	static wrapped(vec: VecLike): Vec {
		if (vec instanceof Vec) {
			return vec;
		}
		return new Vec(vec);
	}
	static unwrapped(vec: VecLike): number[] {
		if (vec instanceof Vec) {
			return vec.vec;
		}
		return vec;
	}
	static unwrappedCopy(vec: VecLike): number[] {
		if (vec instanceof Vec) {
			return vec.vec.slice();
		}
		return vec.slice();
	}
	static allWrapped<T extends VecLike[]>(
		...vecs: T
	): {
		[K in keyof T]: Vec;
	} {
		return vecs.map((vec) => Vec.wrapped(vec)) as {
			[K in keyof T]: Vec;
		};
	}
	static from(vec: VecLike) {
		return new Vec(Vec.unwrappedCopy(vec));
	}
	static zero(dimensions: number) {
		return new Vec(new Array(dimensions).fill(0));
	}
	static fromAngle2d(angle: number) {
		return new Vec([Math.cos(angle), Math.sin(angle)]);
	}
	static add(a: VecLike, b: VecLike) {
		return new Vec(Vec.unwrapped(a).map((v, i) => v + Vec.unwrapped(b)[i]));
	}
	static sub(a: VecLike, b: VecLike) {
		return new Vec(Vec.unwrapped(a).map((v, i) => v - Vec.unwrapped(b)[i]));
	}
	static mul(a: VecLike, s: number | VecLike) {
		if (typeof s === "number") {
			return new Vec(Vec.unwrapped(a).map((v) => v * s));
		} else {
			const arr = Vec.unwrapped(s);
			assert(arr.length === Vec.unwrapped(a).length);
			return new Vec(Vec.unwrapped(a).map((v, i) => v * arr[i]));
		}
	}
	static div(a: VecLike, s: number | VecLike) {
		if (typeof s === "number") {
			return new Vec(Vec.unwrapped(a).map((v) => v / s));
		} else {
			const arr = Vec.unwrapped(s);
			assert(arr.length === Vec.unwrapped(a).length);
			return new Vec(Vec.unwrapped(a).map((v, i) => v / arr[i]));
		}
	}
	static normalize(a: VecLike) {
		const length = Vec.magnitude(a);
		if (length !== 0) {
			return Vec.mul(a, 1 / length);
		}
		return new Vec(Vec.unwrapped(a).map(() => 0));
	}
	static magnitude(a: VecLike) {
		return Math.sqrt(Vec.magnitudeSquared(a));
	}
	static magnitudeSquared(a: VecLike) {
		return Vec.unwrapped(a).reduce((sum, v) => sum + v * v, 0);
	}
	static distance(a: VecLike, b: VecLike) {
		return Vec.sub(a, b).magnitude();
	}
	static distanceSquared(a: VecLike, b: VecLike) {
		return Vec.sub(a, b).magnitudeSquared();
	}
	static interpolate(a: VecLike, b: VecLike, t: number) {
		const arrA = Vec.unwrapped(a);
		const arrB = Vec.unwrapped(b);
		assert(arrA.length === arrB.length);
		return new Vec(arrA.map((v, i) => v + (arrB[i] - v) * t));
	}
	static dot(a: VecLike, b: VecLike) {
		const arrA = Vec.unwrapped(a);
		const arrB = Vec.unwrapped(b);
		assert(arrA.length === arrB.length);
		return arrA.reduce((sum, v, i) => sum + v * arrB[i], 0);
	}
	static cross2d(a: VecLike, b: VecLike) {
		assert(Vec.unwrapped(a).length >= 2 && Vec.unwrapped(b).length >= 2);
		const [ax, ay] = a;
		const [bx, by] = b;
		return ax * by - ay * bx;
	}
}

export type Line = [Vec, Vec];
export type Ray = [origin: Vec, direction: Vec];

export type LineIntersectionResult = {
	intersecting: boolean;
	intersection: Vec;
	/** Where on the line a the intersection is */
	t: number;
	/** Where on the line b the intersection is */
	u: number;
};

export type RayLineIntersectionResult = LineIntersectionResult & {
	/** The distance from the ray origin to the intersection point */
	distance: number;
};

export function lineLineIntersection(
	a: Line,
	b: Line
): LineIntersectionResult | null {
	const [as, ae, bs, be] = Vec.allWrapped(a[0], a[1], b[0], b[1]);
	const divisor = (as.x - ae.x) * (bs.y - be.y) - (as.y - ae.y) * (bs.x - be.x);
	if (divisor === 0) {
		return null; // Lines are parallel
	}
	const t =
		((as.x - bs.x) * (bs.y - be.y) - (as.y - bs.y) * (bs.x - be.x)) / divisor;
	const u =
		-((as.x - ae.x) * (as.y - bs.y) - (as.y - ae.y) * (as.x - bs.x)) / divisor;
	const intersecting = t >= 0 && t <= 1 && u >= 0 && u <= 1;
	const intersection = Vec.add(as, Vec.sub(ae, as).mul(t));
	return {
		intersecting,
		intersection,
		/** Where on the line a the intersection is */
		t,
		/** Where on the line b the intersection is */
		u,
	};
}

export function rayLineIntersection(
	ray: Ray,
	line: Line
): RayLineIntersectionResult | null {
	const direction = Vec.wrapped(ray[1]).copy().normalize();
	const intersection = lineLineIntersection(
		[ray[0], Vec.add(ray[0], direction)],
		line
	);
	if (intersection === null) {
		return null; // Lines are parallel
	}
	const intersecting =
		intersection.t >= 0 && intersection.u >= 0 && intersection.u <= 1;
	return {
		...intersection,
		intersecting,
		/** The distance from the ray origin to the intersection point */
		distance: intersection.t,
	};
}

export function snapPointToLine(point: Vec, line: Line) {
	const alongLine = Vec.sub(line[1], line[0]).freeze();
	const length = alongLine.magnitude();
	const lineDir = alongLine.copy().normalize().freeze();
	const rel = Vec.sub(point, line[0]).freeze();
	const projected = clamp(Vec.dot(lineDir, rel), [0, length]);
	const fraction = projected / length;
	const snapped = lineDir.copy().mul(projected).add(line[0]);
	const distance = Vec.distance(point, snapped);
	return {
		/** The distance from the line start to the snapped point */
		projected,
		/** The fraction of the line length that the snapped point is at */
		fraction,
		/** The snapped point on the line */
		snapped,
		/** The distance from the original point to the snapped point */
		distance,
	};
}

export function snapPointToPath(point: Vec, path: Vec[]) {
	let best:
		| {
				distance: number;
				index: number;
				fraction: number;
				snapped: Vec;
		  }
		| undefined;
	for (let i = 0; i < path.length - 1; i++) {
		const res = snapPointToLine(point, [path[i], path[i + 1]]);
		if (best === undefined || res.distance < best.distance) {
			best = {
				distance: res.distance,
				index: i,
				fraction: res.fraction,
				snapped: res.snapped,
			};
		}
	}
	return best;
}

export function advancePositionAlongPath(
	path: Vec[],
	position: {
		index: number;
		fraction: number;
	},
	distance: number
) {
	if (path.length === 0) {
		return position;
	}
	let { index, fraction } = position;
	while (distance > 0 && index < path.length - 1) {
		const segment = Vec.sub(path[index + 1], path[index]);
		const segmentLength = segment.magnitude();
		const leftLengthInSegment = segmentLength * (1 - fraction);
		if (leftLengthInSegment >= distance) {
			fraction += distance / segmentLength;
			distance = 0;
		} else {
			distance -= leftLengthInSegment;
			index++;
			fraction = 0; // Reset fraction to the start of the next segment
		}
	}
	if (index >= path.length - 1) {
		index = path.length - 2; // Ensure we don't go out of bounds
		fraction = 1; // Snap to the end of the path
	}
	return { index, fraction };
}

export function advancePointAlongPath(
	point: Vec,
	path: Vec[],
	distance: number
) {
	const snapped = snapPointToPath(point, path);
	if (snapped === undefined) {
		return { index: 0, fraction: 0 };
	}
	const { index, fraction } = advancePositionAlongPath(
		path,
		{ index: snapped.index, fraction: snapped.fraction },
		distance
	);
	console.log(snapped, index, fraction);
	const segment = Vec.sub(path[index + 1], path[index]);
	const advancedPoint = Vec.add(path[index], segment.copy().mul(fraction));
	return {
		index,
		fraction,
		point: advancedPoint,
	};
}
