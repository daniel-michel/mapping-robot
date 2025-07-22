import { RotoTranslation } from "../math/roto-translation.ts";
import { Vec } from "../math/vec.ts";

export type Robot = {
	wheelConfig: RobotWheelConfig;
	driveSteps: (left: number, right: number) => Promise<void>;
	scan: () => Promise<RangingSensorScan>;
};

export type RobotWheelConfig = {
	trackWidth: number;
	radius: number;
	stepFraction: number;
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
	distanceRange: [number, number];
	points: {
		/** The angle of distance measurement relative to the center of the measurement region */
		angle: number;
		distance: number;
		/** A point in the reference frame of the measurement, the center of the measurement region is along the positive y axis. */
		point: Readonly<Vec> | null;
	}[];
};

export function calculateOdometryWithStepperMotor(
	leftSteps: number,
	rightSteps: number,
	config: RobotWheelConfig
) {
	const stepToDistRatio = config.stepFraction * config.radius * 2 * Math.PI;
	return calculateOdometry(
		leftSteps * stepToDistRatio,
		rightSteps * stepToDistRatio,
		config.trackWidth
	);
}

export function calculateOdometry(
	left: number,
	right: number,
	trackWidth: number
): RotoTranslation {
	if (left === right) {
		return new RotoTranslation(0, [0, left]);
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

	const radius = ((right + left) / (left - right)) * trackWidth * 0.5;
	const angle =
		right !== 0
			? -right / (radius - trackWidth * 0.5)
			: -left / (radius + trackWidth * 0.5);
	const relativeX = -(Math.cos(angle) - 1) * radius;
	const relativeY = Math.sin(angle) * -radius;
	return new RotoTranslation(angle, [relativeX, relativeY]);
}
