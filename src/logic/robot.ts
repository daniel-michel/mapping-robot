import { RotoTranslation } from "./math/roto-translation.ts";
import { mod, random } from "./math/util.ts";
import { Ray, Vec2 } from "./math/vec.ts";
import { sleep } from "./util.ts";
import { World } from "./world.ts";

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
	/** This describes the angle of the region in which the distances are measured */
	angle: number;
	/** The steps in angle between distance measurements */
	angleStep: number;
	/** Number of distance measurements */
	count: number;
	points: {
		/** The angle of distance measurement relative to the center of the measurement region */
		angle: number;
		distance: number;
		/** A point in the reference frame of the measurement, the center of the measurement region is along the positive y axis. */
		point: Readonly<Vec2> | null;
	}[];
};

export class SimulationRobot implements Robot {
	world: World;
	wheelBase: number;
	wheelRadius: number;
	transform: RotoTranslation = new RotoTranslation(0, new Vec2([0, 0]));

	rangingSensor: RangingSensorConfig = {
		rotationAngle: 350 * DEG_TO_RAD,
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
		const points: RangingSensorScan["points"] = this.rangingRays()
			.map(({ ray, angle }) => {
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
						return {
							angle,
							distance: -1,
							point: null,
						};
					}
				}
				const distance = result?.distance ?? -1;
				return {
					angle,
					distance,
					point:
						distance >= 0
							? new Vec2([0, 1]).rotate(angle).mul(distance).freeze()
							: null,
				};
			})
			.toArray();
		const { count: stepCount, size: angleStep } = this.#rangingSensorSteps;
		return {
			angle: this.rangingSensor.rotationAngle,
			angleStep,
			count: stepCount,
			points,
		} satisfies RangingSensorScan;
	}

	async scan() {
		return this.syncScan();
	}

	*rangingRays() {
		const { count: stepCount, size: angleStep } = this.#rangingSensorSteps;
		for (let i = 0; i < stepCount; i++) {
			const angle = (i - (stepCount - 1) / 2) * angleStep;
			const direction = new Vec2([0, 1]).rotate(
				this.transform.rotation + angle
			);
			const ray: Ray = [this.transform.translation.copy(), direction];
			yield { ray, angle };
		}
	}

	driveAng(left: number, right: number) {
		return this.driveDist(left * this.wheelRadius, right * this.wheelRadius);
	}

	async driveDist(left: number, right: number) {
		this.positionHistory.push(this.transform.translation.copy());
		if (this.positionHistory.length > 1_000) {
			this.positionHistory.shift();
		}

		const errorFactor = 0.2;
		// const errorFactor = 0.05;
		// const errorFactor = 0;
		const leftError = random([-1, 0.4]) * errorFactor * left;
		const rightError = random([-1, 0.4]) * errorFactor * right;
		left += leftError;
		right += rightError;

		const originalOrientation = this.transform.rotation;
		const originalPosition = this.transform.translation.copy();
		const animate = true;

		if (animate) {
			const speed = 0.2;
			const duration = Math.max(
				Math.max(Math.abs(left), Math.abs(right)) / speed,
				// 200
				0
			);
			const start = performance.now();
			const end = start + duration;
			while (performance.now() < end) {
				const t = (performance.now() - start) / duration;
				const { translation, rotation } = calculateOdometry(
					left * t,
					right * t,
					this.wheelBase
				);
				const absoluteMovement = translation.rotate(originalOrientation);
				this.transform.rotation = originalOrientation + rotation;
				this.transform.rotation = mod(this.transform.rotation, Math.PI * 2);
				this.transform.translation = originalPosition
					.copy()
					.add(absoluteMovement);
				await sleep(1 / 60);
			}
		}

		const { translation, rotation } = calculateOdometry(
			left,
			right,
			this.wheelBase
		);
		const absoluteMovement = translation.rotate(originalOrientation);
		this.transform.rotation = originalOrientation + rotation;
		this.transform.rotation = mod(this.transform.rotation, Math.PI * 2);
		this.transform.translation = originalPosition.copy().add(absoluteMovement);
	}
}

export function calculateOdometry(
	left: number,
	right: number,
	wheelBase: number
): RotoTranslation {
	if (left === right) {
		return new RotoTranslation(0, new Vec2([0, left]));
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
	return new RotoTranslation(angle, movement);
}
