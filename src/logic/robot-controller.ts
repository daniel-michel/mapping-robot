import { RotoTranslation } from "./math/roto-translation";
import { Vec2 } from "./math/vec";
import {
	rotoTranslateCtx,
	Camera,
	interpolateCamera,
	savedState,
} from "./rendering";
import { calculateOdometry, Robot } from "./robot";
import { Slam } from "./slam";
import { sleep } from "./util";

export class RobotController {
	robot: Robot;
	slam: Slam = new Slam();

	odometrySinceLastScan = {
		rotoTranslation: new RotoTranslation(0, new Vec2([0, 0])),
		totalWheelRotation: 0,
	};

	camera: Camera = {
		transform: new RotoTranslation(0, new Vec2([0, 0])),
		scale: 1,
	};

	constructor(robot: Robot) {
		this.robot = robot;
	}

	getGamepadInput(): {
		longitudinal: number;
		lateral: number;
	} {
		const gamepads = navigator.getGamepads();
		const gamepad = gamepads.find((pad) => pad !== null);
		if (!gamepad) {
			return { longitudinal: 0, lateral: 0 };
		}
		const leftStickX = gamepad.axes[0];
		const rightTrigger = gamepad.buttons[7].value;
		const leftTrigger = gamepad.buttons[6].value;
		const longitudinal = rightTrigger - leftTrigger;
		const lateral =
			Math.sign(leftStickX) * Math.max(0, Math.abs(leftStickX) - 0.1);
		return { longitudinal, lateral };
	}

	async run() {
		this.slam.addScan(await this.robot.scan());

		// await this.manualControl();

		await this.driveAndScan(20, 18);

		// await this.driveAndScan(11, 10);
		// await this.driveAndScan(11, 10);
		// await this.driveAndScan(11, 10);
		// await this.driveAndScan(11, 10);
		// await this.driveAndScan(10, 10);
		// await this.driveAndScan(10, 11);
		// await this.driveAndScan(4, 5);
		// await this.driveAndScan(10, 10);
		// await this.driveAndScan(2, -1);
		// await this.driveAndScan(11, 10);
		// await this.driveAndScan(11, 10);
		// await this.driveAndScan(11, 8);
		// await this.driveAndScan(11, 9);
		// await this.driveAndScan(10, 10);
		// await this.driveAndScan(12, 16);
		// await this.driveAndScan(12, 12);
		// await this.driveAndScan(5, 7);
		// await this.driveAndScan(5, 5);
		// await this.driveAndScan(10, 5);
		// await this.driveAndScan(11, 10);
		// await this.driveAndScan(17, 14);
		// await this.driveAndScan(14, 15);
		// await this.driveAndScan(14, 14);
		// await this.driveAndScan(20, 17);
		// await this.driveAndScan(20, 20);
		// await this.driveAndScan(2, 0);
		// await this.driveAndScan(4, 4);
	}

	async manualControl() {
		const t = 1 / 30;
		while (true) {
			let { longitudinal, lateral } = this.getGamepadInput();
			lateral =
				Math.sign(lateral) *
				Math.min(
					Math.abs(lateral) * (Math.abs(longitudinal) * 0.5 + 0.1),
					// Math.abs(longitudinal) + 0.1
					1000000
				);
			let left = longitudinal * 1.5 + lateral;
			let right = longitudinal * 1.5 - lateral;
			const max = Math.max(Math.abs(left), Math.abs(right));
			const limit = 100;
			if (max > limit) {
				const scale = limit / max;
				left *= scale;
				right *= scale;
			}
			await Promise.all([this.drive(left, right), sleep(t)]);

			if (
				this.odometrySinceLastScan.totalWheelRotation * this.robot.wheelRadius >
				100
			) {
				await this.scan();
			}
		}
	}

	async drive(left: number, right: number) {
		const odometry = calculateOdometry(
			left * this.robot.wheelRadius,
			right * this.robot.wheelRadius,
			this.robot.wheelBase
		);
		await this.robot.driveAng(left, right);
		this.odometrySinceLastScan.rotoTranslation = RotoTranslation.combine(
			this.odometrySinceLastScan.rotoTranslation,
			odometry
		);
		this.odometrySinceLastScan.totalWheelRotation +=
			Math.abs(left) + Math.abs(right);
	}

	async scan() {
		this.slam.move(this.odometrySinceLastScan.rotoTranslation);
		this.odometrySinceLastScan.rotoTranslation = new RotoTranslation(
			0,
			new Vec2([0, 0])
		);
		this.odometrySinceLastScan.totalWheelRotation = 0;
		const scan = await this.robot.scan();
		this.slam.addScan(scan);
	}

	async driveAndScan(left: number, right: number) {
		await this.drive(left, right);
		await this.scan();
	}

	render(ctx: CanvasRenderingContext2D, size: Vec2, t: number) {
		const robotPose = this.slam.poseGraph.getNodeEstimate(this.slam.poseId);
		interpolateCamera(this.camera, robotPose, t);
		const saved = savedState(ctx);
		saved(() => {
			ctx.translate(size.x / 2, size.y / 2);
			ctx.scale(this.camera.scale, -this.camera.scale);
			rotoTranslateCtx(ctx, this.camera.transform.inverse());

			const poseIds = this.slam.poseGraph.nodeEstimates.keys().toArray();
			if (poseIds.length === 0) {
				poseIds.push(0);
			}
			for (const poseId of poseIds) {
				const pose = this.slam.poseGraph.getNodeEstimate(poseId);
				saved(() => {
					rotoTranslateCtx(ctx, pose);
					const wheelWidth = 1;
					ctx.fillStyle = poseId === this.slam.poseId ? "#aaa" : "#ff27";
					ctx.fillRect(
						-0.5 * this.robot.wheelBase - wheelWidth,
						-this.robot.wheelRadius,
						wheelWidth,
						2 * this.robot.wheelRadius
					);
					ctx.fillRect(
						0.5 * this.robot.wheelBase,
						-this.robot.wheelRadius,
						wheelWidth,
						2 * this.robot.wheelRadius
					);
				});
			}
			for (const connection of this.slam.poseGraph.constraints) {
				const firstPose = this.slam.poseGraph.getNodeEstimate(
					connection.nodes[0]
				);
				const secondPose = this.slam.poseGraph.getNodeEstimate(
					connection.nodes[1]
				);
				const color = `hsl(110, 100%, ${connection.strength * 80}%)`;
				ctx.beginPath();
				ctx.moveTo(firstPose.translation.x, firstPose.translation.y);
				ctx.lineTo(secondPose.translation.x, secondPose.translation.y);
				ctx.strokeStyle = color;
				ctx.lineWidth = 1;
				ctx.stroke();
			}

			const surfaces = this.slam.getAbsoluteSurfaces();
			for (const surface of surfaces) {
				ctx.beginPath();
				ctx.moveTo(surface[0].x, surface[0].y);
				for (const point of surface) {
					ctx.lineTo(point.x, point.y);
				}
				ctx.strokeStyle = "#f542";
				ctx.lineWidth = 1;
				ctx.stroke();

				for (const point of surface) {
					ctx.beginPath();
					ctx.arc(point.x, point.y, 1, 0, Math.PI * 2);
					ctx.fillStyle = "#f545";
					ctx.fill();
				}
			}
		});
	}
}
