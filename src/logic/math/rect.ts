import { Vec2, Vec2Like } from "./vec";

export class Rect {
	#center: Vec2;
	#halfSize: Vec2;

	constructor(center: Vec2Like, halfSize: Vec2Like) {
		this.#center = Vec2.wrapped(center);
		this.#halfSize = Vec2.wrapped(halfSize);
	}
	get center() {
		return this.#center;
	}
	get size() {
		return this.#halfSize.copy().mul(2);
	}
	get halfSize() {
		return this.#halfSize;
	}
	get left() {
		return this.#center.x - this.#halfSize.x;
	}
	set left(value: number) {
		const delta = value - this.left;
		this.#center.x += delta / 2;
		this.#halfSize.x -= delta / 2;
	}
	get right() {
		return this.#center.x + this.#halfSize.x;
	}
	set right(value: number) {
		const delta = value - this.right;
		this.#center.x += delta / 2;
		this.#halfSize.x += delta / 2;
	}
	get top() {
		return this.#center.y + this.#halfSize.y;
	}
	set top(value: number) {
		const delta = value - this.top;
		this.#center.y += delta / 2;
		this.#halfSize.y += delta / 2;
	}
	get bottom() {
		return this.#center.y - this.#halfSize.y;
	}
	set bottom(value: number) {
		const delta = value - this.bottom;
		this.#center.y += delta / 2;
		this.#halfSize.y -= delta / 2;
	}

	static overlap(a: Rect, b: Rect): boolean {
		return (
			a.left < b.right &&
			a.right > b.left &&
			a.top > b.bottom &&
			a.bottom < b.top
		);
	}

	static touch(a: Rect, b: Rect): boolean {
		return (
			a.left <= b.right &&
			a.right >= b.left &&
			a.top >= b.bottom &&
			a.bottom <= b.top
		);
	}

	static contains(a: Rect, b: Rect): boolean {
		return (
			a.left <= b.left &&
			a.right >= b.right &&
			a.top >= b.top &&
			a.bottom <= b.bottom
		);
	}

	static containsPoint(a: Rect, b: Vec2): boolean {
		return a.left <= b.x && a.right >= b.x && a.top >= b.y && a.bottom <= b.y;
	}

	static containing(objects: (Rect | Vec2)[]): Rect {
		let left = Infinity;
		let right = -Infinity;
		let top = -Infinity;
		let bottom = Infinity;
		for (const obj of objects) {
			if (obj instanceof Rect) {
				left = Math.min(left, obj.left);
				right = Math.max(right, obj.right);
				top = Math.max(top, obj.top);
				bottom = Math.min(bottom, obj.bottom);
			} else if (obj instanceof Vec2) {
				left = Math.min(left, obj.x);
				right = Math.max(right, obj.x);
				top = Math.max(top, obj.y);
				bottom = Math.min(bottom, obj.y);
			}
		}
		if (
			left === Infinity ||
			right === -Infinity ||
			top === -Infinity ||
			bottom === Infinity
		) {
			return new Rect([0, 0], [0, 0]);
		}
		return new Rect(
			[(left + right) / 2, (top + bottom) / 2],
			[(right - left) / 2, (top - bottom) / 2]
		);
	}
}
