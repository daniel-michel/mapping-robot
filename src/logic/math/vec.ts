export type VecArray = number[];

export type Vec2Like = [x: number, y: number] | Vec2;
export type Vec3Like = [x: number, y: number, z: number] | Vec3;

export class Vec2 {
	vec: [number, number];

	get [0](): number {
		return this.vec[0];
	}
	get [1](): number {
		return this.vec[1];
	}
	set [0](value: number) {
		this.vec[0] = value;
	}
	set [1](value: number) {
		this.vec[1] = value;
	}

	get x(): number {
		return this.vec[0];
	}
	get y(): number {
		return this.vec[1];
	}
	set x(value: number) {
		this.vec[0] = value;
	}
	set y(value: number) {
		this.vec[1] = value;
	}

	constructor(vec: [x: number, y: number]) {
		this.vec = vec;
	}

	copy() {
		return new Vec2([this.x, this.y]);
	}

	freeze() {
		return Object.freeze(this);
	}

	set(vec: Vec2Like) {
		this.x = vec[0];
		this.y = vec[1];
		return this;
	}

	add(other: Vec2Like) {
		this.x += other[0];
		this.y += other[1];
		return this;
	}
	sub(other: Vec2Like) {
		this.x -= other[0];
		this.y -= other[1];
		return this;
	}
	mul(s: number) {
		this.x *= s;
		this.y *= s;
		return this;
	}
	div(s: number) {
		this.x /= s;
		this.y /= s;
		return this;
	}
	normalize() {
		const length = this.magnitude();
		if (length !== 0) {
			this.x /= length;
			this.y /= length;
		}
		return this;
	}
	magnitude() {
		return Math.sqrt(this.x * this.x + this.y * this.y);
	}
	magnitudeSquared() {
		return this.x * this.x + this.y * this.y;
	}
	rotate(angle: number) {
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		const x = this.x * cos - this.y * sin;
		const y = this.x * sin + this.y * cos;
		this.x = x;
		this.y = y;
		return this;
	}

	*[Symbol.iterator]() {
		yield this.x;
		yield this.y;
	}

	static wrapped(vec: Vec2Like) {
		if (vec instanceof Vec2) {
			return vec;
		}
		return new Vec2(vec);
	}
	static unwrapped(vec: Vec2Like) {
		if (vec instanceof Vec2) {
			return vec.vec;
		}
		return vec;
	}
	static allWrapped<T extends Vec2Like[]>(...vecs: T) {
		return vecs.map((vec) => Vec2.wrapped(vec)) as {
			[K in keyof T]: Vec2;
		};
	}
	static from(vec: Vec2Like) {
		return new Vec2([vec[0], vec[1]]);
	}
	static fromAngle(angle: number) {
		return new Vec2([Math.cos(angle), Math.sin(angle)]);
	}
	static add(a: Vec2Like, b: Vec2Like) {
		return new Vec2([a[0] + b[0], a[1] + b[1]]);
	}
	static sub(a: Vec2Like, b: Vec2Like) {
		return new Vec2([a[0] - b[0], a[1] - b[1]]);
	}
	static mul(a: Vec2Like, s: number) {
		return new Vec2([a[0] * s, a[1] * s]);
	}
	static div(a: Vec2Like, s: number) {
		return new Vec2([a[0] / s, a[1] / s]);
	}
	static normalize(a: Vec2Like) {
		const length = Math.sqrt(a[0] * a[0] + a[1] * a[1]);
		if (length !== 0) {
			return new Vec2([a[0] / length, a[1] / length]);
		}
		return new Vec2([0, 0]);
	}
	static dot(a: Vec2Like, b: Vec2Like) {
		return a[0] * b[0] + a[1] * b[1];
	}
	static cross(a: Vec2Like, b: Vec2Like) {
		return a[0] * b[1] - a[1] * b[0];
	}
	static magnitude(a: Vec2Like) {
		return Math.sqrt(a[0] * a[0] + a[1] * a[1]);
	}
	static magnitudeSquared(a: Vec2Like) {
		return a[0] * a[0] + a[1] * a[1];
	}
	static distance(a: Vec2Like, b: Vec2Like) {
		return Vec2.sub(a, b).magnitude();
	}
	static interpolate(a: Vec2Like, b: Vec2Like, t: number) {
		return new Vec2([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
	}
}

export class Vec3 {
	vec: [number, number, number];

	get [0](): number {
		return this.vec[0];
	}
	get [1](): number {
		return this.vec[1];
	}
	get [2](): number {
		return this.vec[2];
	}
	set [0](value: number) {
		this.vec[0] = value;
	}
	set [1](value: number) {
		this.vec[1] = value;
	}
	set [2](value: number) {
		this.vec[2] = value;
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
	set x(value: number) {
		this.vec[0] = value;
	}
	set y(value: number) {
		this.vec[1] = value;
	}
	set z(value: number) {
		this.vec[2] = value;
	}

	constructor(vec: [x: number, y: number, z: number]) {
		this.vec = vec;
	}

	copy() {
		return new Vec3([this.x, this.y, this.z]);
	}

	*[Symbol.iterator]() {
		yield this.x;
		yield this.y;
		yield this.z;
	}

	static wrapped(vec: Vec3Like) {
		if (vec instanceof Vec3) {
			return vec;
		}
		return new Vec3(vec);
	}
	static unwrapped(vec: Vec3Like) {
		if (vec instanceof Vec3) {
			return vec.vec;
		}
		return vec;
	}
}

export type Line = [Vec2Like, Vec2Like];
export type Ray = [origin: Vec2Like, direction: Vec2Like];

export type LineIntersectionResult = {
	intersecting: boolean;
	intersection: Vec2;
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
	const [as, ae, bs, be] = Vec2.allWrapped(a[0], a[1], b[0], b[1]);
	const divisor = (as.x - ae.x) * (bs.y - be.y) - (as.y - ae.y) * (bs.x - be.x);
	if (divisor === 0) {
		return null; // Lines are parallel
	}
	const t =
		((as.x - bs.x) * (bs.y - be.y) - (as.y - bs.y) * (bs.x - be.x)) / divisor;
	const u =
		-((as.x - ae.x) * (as.y - bs.y) - (as.y - ae.y) * (as.x - bs.x)) / divisor;
	const intersecting = t >= 0 && t <= 1 && u >= 0 && u <= 1;
	const intersection = as.copy().add(ae.copy().sub(as).mul(t));
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
	ray: [origin: Vec2Like, direction: Vec2Like],
	line: Line
): RayLineIntersectionResult | null {
	const direction = Vec2.wrapped(ray[1]).copy().normalize();
	const intersection = lineLineIntersection(
		[ray[0], Vec2.add(ray[0], direction)],
		line
	);
	if (intersection === null) {
		return null; // Lines are parallel
	}
	const intersecting =
		intersection.t >= 0 && intersection.u >= 0 && intersection.u <= 1;
	// const intersectionPoint = intersection.intersection;
	return {
		...intersection,
		intersecting,
		/** The distance from the ray origin to the intersection point */
		distance: intersection.t,
	};
}
