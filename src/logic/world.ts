import {
	Line,
	Ray,
	rayLineIntersection,
	RayLineIntersectionResult,
	Vec2,
	Vec2Like,
} from "./math/vec";
import { createLcg } from "./pseudorandom";

export class World {
	walls: Line[];

	constructor(walls: Line[]) {
		this.walls = walls;
	}

	castRay(ray: Ray) {
		let closest: RayLineIntersectionResult | null = null;
		for (const wall of this.walls) {
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

	static generate(seed: number) {
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
			const mid = [
				(start[0] + end[0]) / 2,
				(start[1] + end[1]) / 2,
			] as Vec2Like;
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
}
