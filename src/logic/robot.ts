import { mod, random } from "./math/util";
import { Ray, Vec2 } from "./math/vec";
import { sleep } from "./util";
import { World } from "./world";

const DEG_TO_RAD = Math.PI / 180;

export type Robot = {
	wheelBase: number;
	wheelRadius: number;
	driveAng: (left: number, right: number) => Promise<void>;
	scan: () => Promise<RangingSensorScan>;
};

export type RangingSensorConfig = {
	rotationAngle: number;
	targetAngleStepSize: number;
	distanceRange: [number, number];
	distanceAccuracy: number;
	angularAccuracy: number;
	refreshTime: number;
};
export type RangingSensorScan = {
	angle: number;
	angleStep: number;
	angleCount: number;
	distances: number[];
};

export class SimulationRobot implements Robot {
	world: World;
	wheelBase: number;
	wheelRadius: number;
	position: Vec2 = new Vec2([0, 0]);
	orientation: number = 0;

	rangingSensor: RangingSensorConfig = {
		rotationAngle: 160 * DEG_TO_RAD,
		/** this is the targeted step size not actually used */
		targetAngleStepSize: 2 * DEG_TO_RAD,
		distanceRange: [2, 780],
		distanceAccuracy: 4,
		// distanceAccuracy: 0,
		angularAccuracy: 2.5 * DEG_TO_RAD,
		// angularAccuracy: 0,
		refreshTime: 1 / 50,
	};

	positionHistory: Vec2[] = [];

	constructor(wheelBase: number, wheelRadius: number, world: World) {
		this.wheelBase = wheelBase;
		this.wheelRadius = wheelRadius;
		this.world = world;
	}

	get #rangingSensorSteps() {
		const stepCount = Math.round(
			this.rangingSensor.rotationAngle / this.rangingSensor.targetAngleStepSize
		);
		const angleStep = this.rangingSensor.rotationAngle / (stepCount - 1);
		return { size: angleStep, count: stepCount };
	}

	syncScan() {
		const distances = this.rangingRays()
			.map((ray) => {
				const rotatedRay: Ray = [
					Vec2.wrapped(ray[0]).copy(),
					Vec2.wrapped(ray[1])
						.copy()
						.rotate(random([-1, 1]) * this.rangingSensor.angularAccuracy),
				];
				const result = this.world.castRay(rotatedRay);
				if (result !== null) {
					result.distance +=
						random([-1, 1]) * this.rangingSensor.distanceAccuracy;
					if (
						result.distance < this.rangingSensor.distanceRange[0] ||
						result.distance > this.rangingSensor.distanceRange[1]
					) {
						return -1;
					}
				}
				return result?.distance ?? -1;
			})
			.toArray();
		const { count: stepCount, size: angleStep } = this.#rangingSensorSteps;
		return {
			angle: this.rangingSensor.rotationAngle,
			angleStep,
			angleCount: stepCount,
			distances,
		} satisfies RangingSensorScan;
	}

	async scan() {
		return this.syncScan();
	}

	*rangingRays() {
		const { count: stepCount, size: angleStep } = this.#rangingSensorSteps;
		for (let i = 0; i < stepCount; i++) {
			const angle = (i - (stepCount - 1) / 2) * angleStep;
			const direction = new Vec2([0, 1]).rotate(this.orientation + angle);
			const ray: Ray = [this.position.copy(), direction];
			yield ray;
		}
	}

	driveAng(left: number, right: number) {
		return this.driveDist(left * this.wheelRadius, right * this.wheelRadius);
	}

	async driveDist(left: number, right: number) {
		this.positionHistory.push(this.position.copy());
		if (this.positionHistory.length > 1_000) {
			this.positionHistory.shift();
		}

		const originalOrientation = this.orientation;
		const originalPosition = this.position.copy();
		const animate = true;

		if (animate) {
			const speed = 0.1;
			const duration = Math.max(
				Math.max(Math.abs(left), Math.abs(right)) / speed,
				200
			);
			const start = performance.now();
			const end = start + duration;
			while (performance.now() < end) {
				const t = (performance.now() - start) / duration;
				const { movement, rotation } = calculateOdometry(
					left * t,
					right * t,
					this.wheelBase
				);
				const absoluteMovement = movement.rotate(originalOrientation);
				this.orientation = originalOrientation + rotation;
				this.orientation = mod(this.orientation, Math.PI * 2);
				this.position = originalPosition.copy().add(absoluteMovement);
				await sleep(1 / 60);
			}
		}

		const errorFactor = 0.01;

		const { movement, rotation } = calculateOdometry(
			left + random([-left, left * 0.3]) * errorFactor,
			right + random([-right, right * 0.3]) * errorFactor,
			this.wheelBase
		);
		const absoluteMovement = movement.rotate(originalOrientation);
		this.orientation = originalOrientation + rotation;
		this.orientation = mod(this.orientation, Math.PI * 2);
		this.position = originalPosition.copy().add(absoluteMovement);
	}
}

export function calculateOdometry(
	left: number,
	right: number,
	wheelBase: number
): {
	movement: Vec2;
	rotation: number;
} {
	if (left === right) {
		return {
			movement: new Vec2([0, left]),
			rotation: 0,
		};
	}

	// left / (r + wb/2) = right / (r - wb/2)
	// left * (r - wb/2) = right * (r + wb/2)
	// left * r - left * wb/2 = right * r + right * wb/2
	// left * r - right * r - left * wb/2 = right * wb/2
	// r * (left - right) - left * wb/2 = right * wb/2
	// r * (left - right) = (right + left) * wb/2
	// r = (right + left) / (left - right) * wb/2

	// a = min(left, right) / (r - wb/2) = max(left, right) / (r + wb/2)
	// d = r * a
	// d = r * min(left, right) / (r - wb/2)

	const radius = ((right + left) / (left - right)) * wheelBase * 0.5;
	const angle =
		right !== 0
			? -right / (radius - wheelBase * 0.5)
			: -left / (radius + wheelBase * 0.5);
	const relativeX = -(Math.cos(angle) - 1) * radius;
	const relativeY = Math.sin(angle) * -radius;
	const movement = new Vec2([relativeX, relativeY]);
	return {
		movement,
		rotation: angle,
	};
}
