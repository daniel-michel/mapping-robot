import { RotoTranslation } from "../math/roto-translation.ts";
import { DEG_TO_RAD, mod, random } from "../math/util.ts";
import { Ray, Vec } from "../math/vec.ts";
import { sleep } from "../util.ts";
import { World } from "../world.ts";
import {
	calculateOdometry,
	RangingSensorConfig,
	RangingSensorScan,
	Robot,
} from "./robot.ts";

export class SimulationRobot implements Robot {
	world: World;
	wheelBase: number;
	wheelRadius: number;
	transform: RotoTranslation = new RotoTranslation(0, [0, 0]);

	rangingSensor: RangingSensorConfig = {
		rotationAngle: 135 * DEG_TO_RAD,
		/** this is the targeted step size the actual step size may vary to fully utilize the rotationAngle */
		targetAngleStepSize: 2 * DEG_TO_RAD,
		distanceRange: [2, 780],
		distanceAccuracy: 4,
		angularAccuracy: 3.5 * DEG_TO_RAD,
		refreshTime: 1 / 50,
	};

	positionHistory: Vec[] = [];

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
					Vec.wrapped(ray[0]).copy(),
					Vec.wrapped(ray[1])
						.copy()
						.rotate2d(random([-1, 1]) * this.rangingSensor.angularAccuracy),
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
							? new Vec([0, 1]).rotate2d(angle).mul(distance).freeze()
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
			distanceRange: this.rangingSensor.distanceRange,
		} satisfies RangingSensorScan;
	}

	async scan() {
		return this.syncScan();
	}

	*rangingRays() {
		const { count: stepCount, size: angleStep } = this.#rangingSensorSteps;
		for (let i = 0; i < stepCount; i++) {
			const angle = (i - (stepCount - 1) / 2) * angleStep;
			const direction = new Vec([0, 1]).rotate2d(
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

		const errorFactor = 0.1;
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
				const absoluteMovement = translation.rotate2d(originalOrientation);
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
		const absoluteMovement = translation.rotate2d(originalOrientation);
		this.transform.rotation = originalOrientation + rotation;
		this.transform.rotation = mod(this.transform.rotation, Math.PI * 2);
		this.transform.translation = originalPosition.copy().add(absoluteMovement);
	}
}
