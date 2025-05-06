import { Vec2 } from "./math/vec";
import { interpolateCamera, savedState } from "./rendering";
import { calculateOdometry, Robot } from "./robot";
import { Slam } from "./slam";
import { sleep } from "./util";

export class RobotController {
	robot: Robot;
	slam: Slam = new Slam();

	camera = {
		position: new Vec2([0, 0]),
		orientation: 0,
		scale: 1,
	};

	constructor(robot: Robot) {
		this.robot = robot;
	}

	async run() {
		this.slam.addScan(await this.robot.scan());
		await this.driveAndScan(11, 10);
		await this.driveAndScan(11, 10);
		await this.driveAndScan(11, 10);
		await this.driveAndScan(11, 10);
		await this.driveAndScan(10, 10);
		await this.driveAndScan(10, 11);
		await this.driveAndScan(4, 5);
		await this.driveAndScan(10, 10);
		await this.driveAndScan(2, -1);
		await this.driveAndScan(11, 10);
		await this.driveAndScan(11, 10);
		await this.driveAndScan(11, 8);
		await this.driveAndScan(11, 9);
		await this.driveAndScan(10, 10);
		await this.driveAndScan(12, 16);
		await this.driveAndScan(12, 12);
		await this.driveAndScan(5, 7);
		await this.driveAndScan(5, 5);
		await this.driveAndScan(10, 5);
		await this.driveAndScan(11, 10);
		await this.driveAndScan(17, 14);
		await this.driveAndScan(14, 15);
		await this.driveAndScan(14, 14);
		await this.driveAndScan(20, 17);
		await this.driveAndScan(20, 20);
		await this.driveAndScan(2, 0);
		await this.driveAndScan(4, 4);
	}

	async driveAndScan(left: number, right: number) {
		const odometry = calculateOdometry(
			left * this.robot.wheelRadius,
			right * this.robot.wheelRadius,
			this.robot.wheelBase
		);
		await this.robot.driveAng(left, right);
		this.slam.move(odometry.movement, odometry.rotation);
		await sleep(500);
		this.slam.addScan(await this.robot.scan());
	}

	render(ctx: CanvasRenderingContext2D, size: Vec2, t: number) {
		const robotPose = this.slam.poseGraph.getNodeEstimate(this.slam.poseId);
		interpolateCamera(this.camera, robotPose, t);
		const saved = savedState(ctx);
		saved(() => {
			ctx.translate(size.x / 2, size.y / 2);
			ctx.scale(this.camera.scale, -this.camera.scale);
			ctx.rotate(-this.camera.orientation);
			ctx.translate(-this.camera.position.x, -this.camera.position.y);

			const poseIds = this.slam.poseGraph.nodeEstimates.keys().toArray();
			if (poseIds.length === 0) {
				poseIds.push(0);
			}
			for (const poseId of poseIds) {
				const pose = this.slam.poseGraph.getNodeEstimate(poseId);
				saved(() => {
					ctx.translate(pose.position.x, pose.position.y);
					ctx.rotate(pose.orientation);
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
				ctx.beginPath();
				ctx.moveTo(firstPose.position.x, firstPose.position.y);
				ctx.lineTo(secondPose.position.x, secondPose.position.y);
				ctx.strokeStyle = "#4f36";
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
				ctx.strokeStyle = "#f545";
				ctx.lineWidth = 1;
				ctx.stroke();
			}
		});
	}
}
