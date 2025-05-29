import {
	Line,
	Ray,
	rayLineIntersection,
	RayLineIntersectionResult,
	Vec,
} from "./math/vec.ts";
import { AABBTree } from "./data-structures/aabb-tree.ts";
import { Rect } from "./math/rect.ts";

export class World {
	walls: Line[];
	tree: AABBTree<Line>;

	constructor(walls: Line[]) {
		this.walls = walls;
		this.tree = new AABBTree(walls, (line) =>
			Rect.containing([Vec.wrapped(line[0]), Vec.wrapped(line[1])])
		);
	}

	castRay(ray: Ray) {
		const origin = Vec.wrapped(ray[0]);
		const direction = Vec.wrapped(ray[1]).copy().normalize();
		let closest: RayLineIntersectionResult | null = null;
		for (const { value: wall, dist } of this.tree.raycast(origin, direction)) {
			if (closest !== null && closest.distance < dist) {
				break;
			}
			const intersection = rayLineIntersection(ray, wall);
			if (intersection === null || !intersection.intersecting) {
				continue;
			}
			if (closest === null || intersection.distance < closest.distance) {
				closest = intersection;
			}
		}
		return closest;
	}
}
