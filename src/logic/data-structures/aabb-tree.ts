import { Rect } from "../math/rect.ts";
import { Vec2 } from "../math/vec.ts";
import { PriorityQueue } from "./priority-queue.ts";

type LeafNode<T> = {
	rect: Rect;
	value: T;
};
type InternalNode<T> = {
	rect: Rect;
	left: TreeNode<T>;
	right: TreeNode<T>;
};
type TreeNode<T> = LeafNode<T> | InternalNode<T>;

export class AABBTree<T> {
	root: TreeNode<T> | null = null;
	#bounds;

	constructor(objects: T[], bounds: (obj: T) => Rect) {
		this.#bounds = bounds;
		this.root = this.build(objects);
	}

	private build(objects: T[]): TreeNode<T> | null {
		if (objects.length === 0) return null;
		if (objects.length === 1) {
			return {
				rect: this.#bounds(objects[0]),
				value: objects[0],
			};
		}
		const overall = this.computeOverallRect(objects);
		// Split objects by longest axis
		const axis = overall.size.x > overall.size.y ? "x" : "y";
		objects.sort((a, b) => {
			const aRect = this.#bounds(a);
			const bRect = this.#bounds(b);
			const aCenter = axis === "x" ? aRect.center.x : aRect.center.y;
			const bCenter = axis === "x" ? bRect.center.x : bRect.center.y;
			return aCenter - bCenter;
		});
		const mid = Math.floor(objects.length / 2);
		const left = this.build(objects.slice(0, mid));
		const right = this.build(objects.slice(mid));
		if (!left || !right)
			throw new Error("Unexpected null child in internal node");
		return {
			rect: overall,
			left,
			right,
		};
	}

	private computeOverallRect(objects: T[]): Rect {
		return Rect.containing(objects.map(this.#bounds));
	}

	// Example query: find all objects whose Rect intersects a given Rect
	*query(rect: Rect, node: TreeNode<T> | null = this.root): Generator<T> {
		if (!node) return;
		if (!Rect.overlap(rect, node.rect)) return;
		if ("value" in node) {
			if (Rect.overlap(rect, node.rect)) {
				yield node.value;
			}
		} else {
			yield* this.query(rect, node.left);
			yield* this.query(rect, node.right);
		}
	}

	*raycast(
		rayOrigin: Vec2,
		rayDir: Vec2
	): Generator<{ dist: number; value: T }> {
		type StackNode = { node: TreeNode<T>; t: number };
		if (!this.root) return;
		const stack = new PriorityQueue<StackNode>((a, b) => a.t - b.t);
		const tRoot = rayRectIntersection(rayOrigin, rayDir, this.root.rect);
		if (tRoot === null) return;
		stack.insert({ node: this.root, t: tRoot });
		while (stack.length > 0) {
			// Pop the node with the smallest t
			const { node, t } = stack.pop()!;
			if ("value" in node) {
				// Leaf node
				yield {
					value: node.value,
					dist: t,
				};
			} else {
				// Internal node
				const tLeft = rayRectIntersection(rayOrigin, rayDir, node.left.rect);
				const tRight = rayRectIntersection(rayOrigin, rayDir, node.right.rect);
				if (tLeft !== null) stack.insert({ node: node.left, t: tLeft });
				if (tRight !== null) stack.insert({ node: node.right, t: tRight });
			}
		}
	}
}

function rayRectIntersection(
	rayOrigin: Vec2,
	rayDir: Vec2,
	rect: Rect
): number | null {
	// Slab method
	const invDirX = 1 / rayDir.x;
	const invDirY = 1 / rayDir.y;
	const tx1 = (rect.left - rayOrigin.x) * invDirX;
	const tx2 = (rect.right - rayOrigin.x) * invDirX;
	const ty1 = (rect.bottom - rayOrigin.y) * invDirY;
	const ty2 = (rect.top - rayOrigin.y) * invDirY;
	const tmin = Math.max(Math.min(tx1, tx2), Math.min(ty1, ty2));
	const tmax = Math.min(Math.max(tx1, tx2), Math.max(ty1, ty2));
	if (tmax < 0 || tmin > tmax) return null;
	return tmin >= 0 ? tmin : tmax;
}
