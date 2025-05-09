import { Vec2 } from "./math/vec";
import { hashString } from "./pseudorandom";
import {
	rotoTranslateCtx,
	Camera,
	interpolateCamera,
	savedState,
} from "./rendering";
import { RangingSensorScan, SimulationRobot } from "./robot";
import { World } from "./world";

export class Simulation {
	world = World.generate(hashString("hello world"));
	robot = new SimulationRobot(15, 5, this.world);
	camera: Camera = {
		transform: this.robot.transform.copy(),
		scale: 1,
	};
	scan?: RangingSensorScan;

	render(ctx: CanvasRenderingContext2D, size: Vec2, t: number) {
		this.scan = this.robot.syncScan();
		interpolateCamera(this.camera, this.robot.transform, t);
		const saved = savedState(ctx);
		saved(() => {
			ctx.translate(size.x / 2, size.y / 2);
			saved(() => {
				// camera transform
				ctx.scale(this.camera.scale, -this.camera.scale);
				rotoTranslateCtx(ctx, this.camera.transform.inverse());

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
					rotoTranslateCtx(ctx, this.robot.transform);
					if (this.scan) {
						for (let i = 0; i < this.scan.angleCount; i++) {
							const point = this.scan.points[i];
							const length = point.distance >= 0 ? point.distance : 10;
							ctx.beginPath();
							ctx.moveTo(0, 0);
							const hitPoint = new Vec2([0, 1])
								.rotate(this.scan.angleStep * i - this.scan.angle / 2)
								.mul(length);
							ctx.lineTo(hitPoint.x, hitPoint.y);
							ctx.strokeStyle = point.distance >= 0 ? "#2493" : "#f003";
							ctx.lineWidth = 1;
							ctx.stroke();
						}
						for (let i = 0; i < this.scan.angleCount; i++) {
							const point = this.scan.points[i];
							const length = point.distance >= 0 ? point.distance : 10;
							const hitPoint = new Vec2([0, 1])
								.rotate(this.scan.angleStep * i - this.scan.angle / 2)
								.mul(length);
							if (point.distance >= 0) {
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
					rotoTranslateCtx(ctx, this.robot.transform);
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
