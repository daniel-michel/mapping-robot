import { RotoTranslation } from "./math/roto-translation";
import { clamp } from "./math/util.ts";
import { Vec } from "./math/vec";
import { OccupancyBin, OccupancyProb } from "./slam/occupancy-grid.ts";
import {
	rotoTranslateCtx,
	Camera,
	interpolateCamera,
	savedState,
} from "./rendering";
import { calculateOdometry, Robot } from "./robot";
import { Slam } from "./slam/slam.ts";
import { sleep } from "./util";
import { Grid } from "./data-structures/grid.ts";

const renderOccupancyProbGrid = gridRenderer<OccupancyProb>(
	(value) =>
		`hsla(${120 - value.prob * 120}, 100%, 70%, ${
			(1 - 1 / (1 + value.weight * 0.5)) * 0.3
		})`,
	false
);
const renderOccupancyGrid = gridRenderer<OccupancyBin>(
	(value) =>
		value === 1 ? "hsla(0, 0%, 100%, 0.3)" : "hsla(230, 100%, 65%, 0.1)",
	false
);
const renderExploreGrid = gridRenderer<true>(
	() => "hsla(313, 100.00%, 65.70%, 0.4)",
	false
);

export class RobotController {
	robot: Robot;
	slam: Slam = new Slam();

	odometrySinceLastRecord = {
		rotoTranslation: new RotoTranslation(0, [0, 0]),
		totalWheelRotation: 0,
	};

	camera: Camera = {
		transform: new RotoTranslation(0, [0, 0]),
		scale: 1,
	};

	highlightedCells: { coord: Vec; lifetime: number }[] = [];

	constructor(robot: Robot) {
		this.robot = robot;

		(async () => {
			while (true) {
				await sleep(3_000);
				await new Promise((r) => requestAnimationFrame(r));
				const start = this.getCurrentRobotPose()
					.translation.copy()
					.div(this.slam.occupancyGridResolution);
				const startTime = Date.now();
				for (const cell of this.slam.occupancyGrids.explore.traverseOutward(
					this.getCurrentRobotPose()
						.translation.copy()
						.div(this.slam.occupancyGridResolution)
				)) {
					const dist = Vec.distance(cell.coord, start);
					const targetTime = startTime + dist * 50;
					this.highlightedCells.push({
						coord: cell.coord,
						lifetime: (Date.now() - targetTime) / 1_000,
					});
					this.highlightedCells;
					const timeout = targetTime - 10 - Date.now();
					if (timeout > 5) {
						await sleep(timeout);
					}
				}
			}
		})();
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

		// await this.driveAndScan(20, 18);
		await this.manualControl();

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
			let left = longitudinal * 0.5 + lateral * 0.3;
			let right = longitudinal * 0.5 - lateral * 0.3;
			const max = Math.max(Math.abs(left), Math.abs(right));
			const limit = 100;
			if (max > limit) {
				const scale = limit / max;
				left *= scale;
				right *= scale;
			}
			await Promise.all([this.drive(left, right), sleep(t)]);

			if (
				this.odometrySinceLastRecord.totalWheelRotation *
					this.robot.wheelRadius >
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
		this.odometrySinceLastRecord.rotoTranslation = RotoTranslation.combine(
			this.odometrySinceLastRecord.rotoTranslation,
			odometry
		);
		this.odometrySinceLastRecord.totalWheelRotation +=
			Math.abs(left) + Math.abs(right);
	}

	async scan() {
		this.slam.move(this.odometrySinceLastRecord.rotoTranslation);
		this.odometrySinceLastRecord.rotoTranslation = new RotoTranslation(
			0,
			[0, 0]
		);
		this.odometrySinceLastRecord.totalWheelRotation = 0;
		const scan = await this.robot.scan();
		this.slam.addScan(scan);
	}

	async driveAndScan(left: number, right: number) {
		await this.drive(left, right);
		await this.scan();
		await sleep(500);
	}

	getCurrentRobotPose() {
		return RotoTranslation.combine(
			this.slam.poseGraph.getNodeEstimate(this.slam.poseId),
			this.odometrySinceLastRecord.rotoTranslation
		);
	}

	render(ctx: CanvasRenderingContext2D, size: Vec2, t: number) {
		this.slam.poseGraph.optimize(1);
		interpolateCamera(this.camera, this.getCurrentRobotPose(), t);
		const saved = savedState(ctx);
		saved(() => {
			ctx.translate(size.x / 2, size.y / 2);
			ctx.scale(this.camera.scale, -this.camera.scale);
			rotoTranslateCtx(ctx, this.camera.transform.inverse());

			for (const connection of this.slam.poseGraph.constraints) {
				const firstPose = this.slam.poseGraph.getNodeEstimate(
					connection.nodes[0]
				);
				const secondPose = this.slam.poseGraph.getNodeEstimate(
					connection.nodes[1]
				);
				const color = `hsla(110, 100%, 60%, ${clamp(
					1 - 0.3 / connection.strength,
					[0.08, 1]
				)})`;
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
					// ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
					ctx.fillStyle = "#f545";
					ctx.fill();
				}
			}

			for (const correspondence of this.slam.correspondences.slice(-1)) {
				const firstPose = this.slam.poseGraph.getNodeEstimate(
					correspondence.poseA
				);
				const secondPose = this.slam.poseGraph.getNodeEstimate(
					correspondence.poseB
				);
				const pairs = correspondence.pairs;
				for (const [i, j] of pairs) {
					const firstPoint = this.slam.scans.get(correspondence.poseA)?.scan
						.points[i].point;
					const secondPoint = this.slam.scans.get(correspondence.poseB)?.scan
						.points[j].point;
					if (!firstPoint || !secondPoint) {
						continue;
					}
					const firstTransformed = firstPose.apply(firstPoint);
					const secondTransformed = secondPose.apply(secondPoint);
					ctx.beginPath();
					ctx.moveTo(firstTransformed.x, firstTransformed.y);
					ctx.lineTo(secondTransformed.x, secondTransformed.y);
					ctx.strokeStyle = "#ff42";
					ctx.lineWidth = 1;
					ctx.stroke();
				}
			}

			saved(() => {
				ctx.scale(
					this.slam.occupancyGridResolution,
					this.slam.occupancyGridResolution
				);
				renderOccupancyProbGrid(ctx, this.slam.occupancyGrids.prob);
				renderOccupancyGrid(ctx, this.slam.occupancyGrids.bin);
				renderExploreGrid(ctx, this.slam.occupancyGrids.explore);

				const CELL_LIFE_TIME = 1;
				for (const cell of this.highlightedCells) {
					cell.lifetime += t;
					if (cell.lifetime < 0) {
						continue;
					}
					const intensity = clamp(1 - cell.lifetime / CELL_LIFE_TIME, [0, 1]);
					ctx.strokeStyle = `hsla(313, 100.00%, 65.70%, ${intensity})`;
					saved(() => {
						ctx.translate(cell.coord.x, cell.coord.y);
						ctx.lineWidth = clamp(0.2 * intensity, [0.01, 0.2]);
						ctx.beginPath();
						ctx.rect(-0.5, -0.5, 1, 1);
						ctx.stroke();
					});
				}
				this.highlightedCells = this.highlightedCells.filter(
					({ lifetime }) => lifetime < CELL_LIFE_TIME
				);
			});

			saved(() => {
				const robotPos = this.getCurrentRobotPose().translation;
				const closestCell = this.slam.occupancyGrids.explore.findClosest(
					robotPos.copy().div(this.slam.occupancyGridResolution),
					(v) => v
				);
				if (!closestCell) {
					return;
				}
				const closest = closestCell
					.copy()
					.mul(this.slam.occupancyGridResolution);

				ctx.beginPath();
				ctx.moveTo(robotPos.x, robotPos.y);
				ctx.lineTo(closest.x, closest.y);
				ctx.strokeStyle = "#f0f";
				ctx.lineWidth = 1;
				ctx.stroke();
			});

			const poseIds = this.slam.poseGraph.nodeEstimates.keys().toArray();
			if (poseIds.length === 0) {
				poseIds.push(0);
			}
			for (const poseId of poseIds) {
				const pose = this.slam.poseGraph.getNodeEstimate(poseId);
				saved(() => {
					rotoTranslateCtx(ctx, pose);
					ctx.fillStyle = poseId === this.slam.poseId ? "#f827" : "#ff27";
					this.renderRobot(ctx);
				});
			}
			saved(() => {
				rotoTranslateCtx(ctx, this.getCurrentRobotPose());
				ctx.fillStyle = "#aaa";
				this.renderRobot(ctx);
			});
		});
	}
	renderRobot(ctx: CanvasRenderingContext2D) {
		const wheelWidth = 1;
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
	}
}

function gridRenderer<T>(color: (value: T) => string, showGridLines: boolean) {
	return (ctx: CanvasRenderingContext2D, grid: Grid<T>) => {
		renderGrid(ctx, grid, color, showGridLines);
	};
}

function renderGrid<T>(
	ctx: CanvasRenderingContext2D,
	grid: Grid<T>,
	color: (value: T) => string,
	showGridLines: boolean,
	depth = 0
) {
	if (depth > 10) {
		return;
	}
	const saved = savedState(ctx);
	const children = grid.children;
	saved(() => {
		const scaleFactor = 3 ** grid.level;
		ctx.scale(scaleFactor, scaleFactor);
		if (showGridLines && grid.level > 0) {
			ctx.strokeStyle = "#04a2";
			ctx.lineWidth =
				((0.1 / scaleFactor) * Math.log2(grid.level / 10 + 2)) / Math.log2(2);
			ctx.strokeRect(-0.5, -0.5, 1, 1);
		}
		if (children.leaf) {
			const value = children.value;
			if (value !== undefined) {
				ctx.fillStyle = color(value);
				const margin = 0.2 / scaleFactor;
				ctx.fillRect(
					-0.5 + margin,
					-0.5 + margin,
					1 - margin * 2,
					1 - margin * 2
				);
			}
		} else {
			for (let i = 0; i < children.nodes.length; i++) {
				const child = children.nodes[i];
				if (child) {
					saved(() => {
						ctx.translate(
							((i % 3) * 1) / 3 - 1 / 3,
							(Math.floor(i / 3) * 1) / 3 - 1 / 3
						);
						ctx.scale(1 / scaleFactor, 1 / scaleFactor);
						renderGrid(ctx, child, color, showGridLines, depth + 1);
					});
				}
			}
		}
	});
}
