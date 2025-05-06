import { Vec2 } from "./math/vec";
import { hashString } from "./pseudorandom";
import { interpolateCamera, savedState } from "./rendering";
import { RangingSensorScan, SimulationRobot } from "./robot";
import { World } from "./world";

export type Camera = {
	position: Vec2;
	orientation: number;
	scale: number;
};

export class Simulation {
	world = World.generate(hashString("hello world"));
	robot = new SimulationRobot(15, 5, this.world);
	camera = {
		position: this.robot.position.copy(),
		orientation: this.robot.orientation,
		scale: 1,
	};
	scan?: RangingSensorScan;
	time = 0;

	constructor() {
		// this.robot.driveAng(30, 31);
		this.robot.position.add([100, 250]);
	}
	update(t: number) {
		this.time += t;
		// this.robot.driveDist(10 * t, 10 * t);
		// if (this.time % 1 < 0.5) {
		// 	const angularSpeed = 4 * 2 * Math.PI;
		// 	this.robot.driveAng(1 * angularSpeed * t, 0.9 * angularSpeed * t);
		// 	this.scan = this.robot.syncScan();
		// 	// maybe use a median filter on the distance
		// }
		this.scan = this.robot.syncScan();
	}

	render(ctx: CanvasRenderingContext2D, size: Vec2, t: number) {
		interpolateCamera(this.camera, this.robot, t);
		const saved = savedState(ctx);
		saved(() => {
			ctx.translate(size.x / 2, size.y / 2);
			saved(() => {
				// camera transform
				ctx.scale(this.camera.scale, -this.camera.scale);
				ctx.rotate(-this.camera.orientation);
				ctx.translate(-this.camera.position.x, -this.camera.position.y);

				for (const wall of this.world.walls) {
					ctx.beginPath();
					ctx.moveTo(wall[0][0], wall[0][1]);
					ctx.lineTo(wall[1][0], wall[1][1]);
					ctx.strokeStyle = "#fff";
					ctx.lineWidth = 1;
					ctx.stroke();
				}

				ctx.beginPath();
				for (const pos of this.robot.positionHistory) {
					ctx.lineTo(pos.x, pos.y);
				}
				ctx.strokeStyle = "#0f0a";
				ctx.lineWidth = 1;
				ctx.stroke();

				saved(() => {
					if (this.scan) {
						for (let i = 0; i < this.scan.angleCount; i++) {
							const dist = this.scan.distances[i];
							const length = dist >= 0 ? dist : 10;
							ctx.beginPath();
							ctx.moveTo(this.robot.position.x, this.robot.position.y);
							const hitPoint = this.robot.position
								.copy()
								.add(
									new Vec2([0, 1])
										.rotate(
											this.robot.orientation +
												this.scan.angleStep * i -
												this.scan.angle / 2
										)
										.mul(length)
								);
							ctx.lineTo(hitPoint.x, hitPoint.y);
							ctx.strokeStyle = dist >= 0 ? "#2493" : "#f003";
							ctx.lineWidth = 1;
							ctx.stroke();
						}
						for (let i = 0; i < this.scan.angleCount; i++) {
							const dist = this.scan.distances[i];
							const length = dist >= 0 ? dist : 10;
							const hitPoint = this.robot.position
								.copy()
								.add(
									new Vec2([0, 1])
										.rotate(
											this.robot.orientation +
												this.scan.angleStep * i -
												this.scan.angle / 2
										)
										.mul(length)
								);
							if (dist >= 0) {
								ctx.beginPath();
								ctx.arc(hitPoint.x, hitPoint.y, 2, 0, Math.PI * 2);
								ctx.fillStyle = "#49f";
								ctx.fill();
							}
						}
					}
				});

				saved(() => {
					// robot transform
					ctx.translate(this.robot.position.x, this.robot.position.y);
					ctx.rotate(this.robot.orientation);
					const wheelWidth = 1;
					ctx.fillStyle = "#888";
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
			});
		});
	}
}
