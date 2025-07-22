import { RotoTranslation } from "./math/roto-translation";
import { angleDiff, angleNormalize, clamp } from "./math/util.ts";
import { advancePointAlongPath, Vec } from "./math/vec";
import { OccupancyBin, OccupancyProb } from "./slam/occupancy-grid.ts";
import {
	rotoTranslateCtx,
	Camera,
	interpolateCamera,
	savedState,
} from "./rendering";
import { calculateOdometryWithStepperMotor, Robot } from "./robot/robot.ts";
import { Slam } from "./slam/slam.ts";
import { sleep } from "./util";
import { Grid } from "./data-structures/grid.ts";
import { AStar, AStarConfig } from "./astar.ts";
import { getInput } from "./input.ts";

const renderOccupancyProbGrid = gridRenderer<OccupancyProb>({
	cellStyle: (value) => {
		return {
			show: true,
			shape: "circle",
			style: "fill",
			margin: 0.3,
			color: `hsla(${120 - value.prob * 120}, 100%, 70%, ${
				(1 - 1 / (1 + value.weight * 0.5)) * 0.7
			})`,
		};
	},
});
const renderOccupancyGrid = gridRenderer<OccupancyBin>({
	cellStyle: (value) => {
		return {
			show: true,
			shape: "rect",
			style: "fill",
			margin: 0.1,
			color:
				value === 1 ? "hsla(0, 0%, 100%, 0.3)" : "hsla(230, 100%, 65%, 0.1)",
		};
	},
});
const renderExploreGrid = gridRenderer<true>({
	cellStyle: (value) => {
		return {
			show: true,
			shape: "diamond",
			style: "outline",
			margin: 0.1,
			strokeWidth: 0.05,
			color: "hsla(313, 100.00%, 65.70%, 0.7)",
		};
	},
});
const renderDrivableGrid = gridRenderer<true>({
	cellStyle: (value) => {
		return {
			show: true,
			shape: "rect",
			style: "fill",
			margin: 0.1,
			color: "hsla(170, 100%, 65%, 0.2)",
		};
	},
});

const SettingDescriptions = {
	probGrid: "Show probability grid",
	occupGrid: "Show occupancy grid",
	exploreGrid: "Show unexplored grid",
	drivableGrid: "Show drivable grid",
	scanSurfaces: "Show scan surfaces",
	poseGraph: "Show pose graph",
	currentPath: "Show navigation path",
} as const;

export class RobotController {
	static SettingDescriptions = SettingDescriptions;
	robot: Robot;
	slam: Slam = new Slam();

	#runningControl?: {
		strategy: string;
		promise: Promise<void>;
		abort: () => Promise<void>;
	};
	#guidedExplorationTarget?: Vec;

	displaySettings: Record<keyof typeof SettingDescriptions, boolean> = {
		probGrid: false,
		occupGrid: true,
		exploreGrid: true,
		drivableGrid: true,
		scanSurfaces: false,
		poseGraph: false,
		currentPath: true,
	};

	get currentControlStrategy() {
		return this.#runningControl?.strategy;
	}

	odometrySinceLastScan = {
		rotoTranslation: new RotoTranslation(0, [0, 0]),
		error: 0,
	};
	errorSinceLastOccupancyGridUpdate = 0;

	camera: Camera = {
		transform: new RotoTranslation(0, [0, 0]),
		scale: 1,
	};

	currentPath?: Vec[];

	highlightedCells: { coord: Vec; lifetime: number }[] = [];

	constructor(robot: Robot) {
		this.robot = robot;

		// (async () => {
		// 	while (true) {
		// 		await sleep(3_000);
		// 		await new Promise((r) => requestAnimationFrame(r));
		// 		const start = this.getCurrentRobotPose()
		// 			.translation.copy()
		// 			.div(this.slam.occupancyGridResolution);
		// 		const startTime = Date.now();
		// 		for (const cell of this.slam.occupancyGrids.explore.traverseOutward(
		// 			this.getCurrentRobotPose()
		// 				.translation.copy()
		// 				.div(this.slam.occupancyGridResolution)
		// 		)) {
		// 			const dist = Vec.distance(cell.coord, start);
		// 			const targetTime = startTime + dist * 50;
		// 			this.highlightedCells.push({
		// 				coord: cell.coord,
		// 				lifetime: (Date.now() - targetTime) / 1_000,
		// 			});
		// 			this.highlightedCells;
		// 			const timeout = targetTime - 10 - Date.now();
		// 			if (timeout > 5) {
		// 				await sleep(timeout);
		// 			}
		// 		}
		// 	}
		// })();
	}

	userClick(pos: Vec, size: Vec) {
		// Convert screen coordinates to world coordinates
		const screenCenter = size.copy().div(2);
		const screenToWorldScale = 1 / this.camera.scale;
		pos.y = size.y - pos.y;
		// pos.x += size.x;
		const worldPos = pos
			.copy()
			.sub(screenCenter)
			.mul(screenToWorldScale)
			.rotate2d(this.camera.transform.rotation)
			.add(this.camera.transform.translation);

		this.#guidedExplorationTarget = worldPos;
	}

	async reset() {
		await this.stop();
		this.slam = new Slam();
		this.odometrySinceLastScan = {
			rotoTranslation: new RotoTranslation(0, [0, 0]),
			error: 0,
		};
		this.errorSinceLastOccupancyGridUpdate = 0;
		this.currentPath = undefined;
		this.highlightedCells = [];
		this.#guidedExplorationTarget = undefined;
	}

	async stop() {
		await this.#runningControl?.abort();
	}

	async #runControlStrategy(
		strategy: string,
		control: (signal: AbortSignal) => Promise<void>
	) {
		if (this.#runningControl) {
			throw new Error(
				`A control strategy is already running: ${
					this.#runningControl.strategy
				}`
			);
		}
		const abortController = new AbortController();
		const resolver = Promise.withResolvers<void>();
		this.#runningControl = {
			strategy,
			promise: resolver.promise,
			abort: async () => {
				abortController.abort();
				await resolver.promise;
			},
		};
		try {
			await control(abortController.signal);
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				console.warn(`Control strategy ${strategy} aborted`);
			} else {
				throw error;
			}
		} finally {
			this.#runningControl = undefined;
			resolver.resolve();
		}
	}

	async manualControl() {
		await this.#runControlStrategy("manual", async (signal) => {
			const t = 1 / 30;
			await this.scan();
			while (true) {
				signal.throwIfAborted();
				let { longitudinal, lateral } = getInput();
				lateral =
					Math.sign(lateral) *
					Math.min(
						Math.abs(lateral) * (Math.abs(longitudinal) * 0.5 + 0.1),
						// Math.abs(longitudinal) + 0.1
						100000
					);
				let left = (longitudinal * 0.5 + lateral * 0.3) * 1_000;
				let right = (longitudinal * 0.5 - lateral * 0.3) * 1_000;
				const max = Math.max(Math.abs(left), Math.abs(right));
				const limit = 1_000;
				if (max > limit) {
					const scale = limit / max;
					left *= scale;
					right *= scale;
				}
				left = Math.round(left);
				right = Math.round(right);
				await Promise.all([this.drive(left, right), sleep(t)]);
				signal.throwIfAborted();

				if (this.odometrySinceLastScan.error > 1) {
					await this.scan();
				}
			}
		});
	}

	async autonomousExploration() {
		await this.#runControlStrategy("autonomous exploration", async (signal) => {
			while (!signal.aborted) {
				await this.scanAndWaitForMatching();
				signal.throwIfAborted();
				await this.slam.updateOccupancyGrid();
				this.errorSinceLastOccupancyGridUpdate = 0;
				const path = pathfindToUnexploredRegion(
					this.slam,
					this.getCurrentRobotPose().translation
				);
				if (!path) {
					throw new Error("No path found to unexplored region");
				}
				await this.progressAlongPath(path, signal);
			}
		});
	}

	async guidedExploration() {
		await this.#runControlStrategy("guided exploration", async (signal) => {
			while (!signal.aborted) {
				if (!this.#guidedExplorationTarget) {
					await sleep(500);
					continue;
				}
				const dist = Vec.distance(
					this.getCurrentRobotPose().translation,
					this.#guidedExplorationTarget
				);
				if (dist < 10) {
					// We are close enough to the target, so we can stop
					this.#guidedExplorationTarget = undefined;
					continue;
				}
				await this.scanAndWaitForMatching();
				signal.throwIfAborted();
				await this.slam.updateOccupancyGrid();
				this.errorSinceLastOccupancyGridUpdate = 0;
				const path = pathfindToPosition(
					this.slam,
					this.getCurrentRobotPose().translation,
					this.#guidedExplorationTarget
				);
				if (!path) {
					throw new Error("No path found to guided exploration target");
				}
				await this.progressAlongPath(path, signal);
			}
		});
		this.#guidedExplorationTarget = undefined;
	}

	async progressAlongPath(path: Vec[], signal: AbortSignal) {
		this.currentPath = path;
		while (this.errorSinceLastOccupancyGridUpdate < 5) {
			signal.throwIfAborted();
			if (
				Vec.distance(
					this.getCurrentRobotPose().translation,
					path[path.length - 1]
				) < 3
			) {
				// We are close enough to the target, so we can stop
				break;
			}
			const targetPosition = advancePointAlongPath(
				this.getCurrentRobotPose().translation,
				path,
				10
			);
			// console.log(targetPosition);
			const targetPoint = targetPosition.point;
			if (!targetPoint) {
				throw new Error("No point found on path");
			}
			const currentTransform = this.getCurrentRobotPose();
			const absoluteTargetOffset = Vec.sub(
				targetPoint,
				currentTransform.translation
			);
			const relativeTargetOffset = absoluteTargetOffset
				.copy()
				.rotate2d(-currentTransform.rotation);

			const allowedLateralDeviation = (longitudinal: number) => {
				const minAllowed = 2;
				const fractionAllowed = 0.3;
				return (
					fractionAllowed * Math.abs(longitudinal) +
					minAllowed /
						(1 + (fractionAllowed / minAllowed) * Math.abs(longitudinal))
				);
			};
			const maxLateral = allowedLateralDeviation(relativeTargetOffset.y);

			if (
				Math.abs(relativeTargetOffset.x) < maxLateral &&
				relativeTargetOffset.y > 0
			) {
				// The robot is pointing close enough to the target, so we can drive towards it

				if (
					!this.slam.occupancyGrids.drivable.get(
						targetPoint.copy().div(this.slam.occupancyGridResolution)
					)
				) {
					break;
				}

				const longitudinal = relativeTargetOffset.y;
				const lateral = relativeTargetOffset.x;
				const rotationFactor =
					1 /
					this.robot.wheelConfig.stepFraction /
					this.robot.wheelConfig.radius;
				let left = (longitudinal * 0.7 + lateral * 0.3) * rotationFactor;
				let right = (longitudinal * 0.7 - lateral * 0.3) * rotationFactor;
				const max = Math.max(Math.abs(left), Math.abs(right));
				const limit = 1_000;
				if (max > limit) {
					const scale = limit / max;
					left *= scale;
					right *= scale;
				}
				// console.log(max, left, right);
				left = Math.round(left);
				right = Math.round(right);
				await this.drive(left, right);
				await sleep(100);
			} else {
				// Rotate towards the target
				const angleToTarget = angleDiff(
					relativeTargetOffset.heading2d(),
					Math.PI / 2
				);
				const radius = this.robot.wheelConfig.trackWidth / 2;
				const wheelDist = radius * angleToTarget * 0.1;
				const wheelRotationAngle =
					wheelDist / (Math.PI * this.robot.wheelConfig.radius);
				const wheelRotationSteps = Math.round(
					wheelRotationAngle / this.robot.wheelConfig.stepFraction
				);
				const left = -wheelRotationSteps;
				const right = wheelRotationSteps;
				await this.drive(left, right);
				await sleep(100);
			}

			if (this.odometrySinceLastScan.error > 1) {
				await this.scanAndWaitForMatching();
			}
		}
	}

	async drive(left: number, right: number) {
		const odometry = calculateOdometryWithStepperMotor(
			left,
			right,
			this.robot.wheelConfig
		);
		await this.robot.driveSteps(left, right);
		this.odometrySinceLastScan.rotoTranslation = RotoTranslation.combine(
			this.odometrySinceLastScan.rotoTranslation,
			odometry
		);
		// this.odometrySinceLastScan.error +=
		// 	(Math.abs(left) + Math.abs(right)) * this.robot.wheelConfig.stepFraction;
		const moveDist =
			((Math.abs(left) + Math.abs(right)) *
				this.robot.wheelConfig.stepFraction *
				this.robot.wheelConfig.radius) /
			2;
		const moveRotation =
			(Math.abs(left - right) *
				this.robot.wheelConfig.stepFraction *
				this.robot.wheelConfig.radius) /
			this.robot.wheelConfig.trackWidth;
		const error = moveDist / 5 + moveRotation / 0.1;
		this.odometrySinceLastScan.error += error;
		this.errorSinceLastOccupancyGridUpdate += error;
	}

	async scan() {
		this.slam.move(this.odometrySinceLastScan.rotoTranslation);
		this.odometrySinceLastScan.rotoTranslation = new RotoTranslation(0, [0, 0]);
		this.odometrySinceLastScan.error = 0;
		const scan = await this.robot.scan();
		this.slam.addScan(scan);
	}
	async scanAndWaitForMatching() {
		this.slam.move(this.odometrySinceLastScan.rotoTranslation);
		this.odometrySinceLastScan.rotoTranslation = new RotoTranslation(0, [0, 0]);
		this.odometrySinceLastScan.error = 0;
		const scan = await this.robot.scan();
		await this.slam.addScan(scan);
	}

	async driveAndScan(left: number, right: number) {
		await this.drive(left, right);
		await this.scanAndWaitForMatching();
		await sleep(500);
	}

	getCurrentRobotPose() {
		return RotoTranslation.combine(
			this.slam.poseGraph.getNodeEstimate(this.slam.poseId),
			this.odometrySinceLastScan.rotoTranslation
		);
	}

	render(ctx: CanvasRenderingContext2D, size: Vec, t: number) {
		// if (
		// 	// false &&
		// 	!this.currentPath &&
		// 	this.slam.occupancyGrids &&
		// 	this.slam.occupancyGrids.explore.findClosest(new Vec([0, 0]), (v) => v)
		// ) {
		// 	const result = pathfindToUnexploredRegion(
		// 		this.slam,
		// 		this.getCurrentRobotPose().translation
		// 	);
		// 	console.log("aStar result", result);
		// 	if (result) {
		// 		this.currentPath = result;
		// 	} else {
		// 		this.currentPath = [this.getCurrentRobotPose().translation.copy()];
		// 	}
		// }

		this.slam.poseGraph.optimize(1);
		interpolateCamera(this.camera, this.getCurrentRobotPose(), t);
		const saved = savedState(ctx);
		saved(() => {
			ctx.translate(size.x / 2, size.y / 2);
			ctx.scale(this.camera.scale, -this.camera.scale);
			rotoTranslateCtx(ctx, this.camera.transform.toInverted());

			if (this.displaySettings.poseGraph) {
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
			}

			if (this.displaySettings.scanSurfaces) {
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
				if (this.displaySettings.probGrid) {
					renderOccupancyProbGrid(ctx, this.slam.occupancyGrids.prob);
				}
				if (this.displaySettings.occupGrid) {
					renderOccupancyGrid(ctx, this.slam.occupancyGrids.bin);
				}
				if (this.displaySettings.exploreGrid) {
					renderExploreGrid(ctx, this.slam.occupancyGrids.explore);
				}
				if (this.displaySettings.drivableGrid) {
					renderDrivableGrid(ctx, this.slam.occupancyGrids.drivable);
				}

				const CELL_LIFE_TIME = 1;
				for (const cell of this.highlightedCells) {
					cell.lifetime += t;
					if (cell.lifetime < 0) {
						continue;
					}
					const intensity = clamp(1 - cell.lifetime / CELL_LIFE_TIME, [0, 1]);
					ctx.strokeStyle = `hsla(313, 100.00%, 65.70%, ${intensity * 0.5})`;
					saved(() => {
						ctx.translate(cell.coord.x, cell.coord.y);
						ctx.lineWidth = clamp(0.1 * intensity, [0.01, 0.2]);
						ctx.beginPath();
						ctx.rect(-0.5, -0.5, 1, 1);
						ctx.stroke();
					});
				}
				this.highlightedCells = this.highlightedCells.filter(
					({ lifetime }) => lifetime < CELL_LIFE_TIME
				);
			});

			// saved(() => {
			// 	const robotPos = this.getCurrentRobotPose().translation;
			// 	const closestCell = this.slam.occupancyGrids.explore.findClosest(
			// 		robotPos.copy().div(this.slam.occupancyGridResolution),
			// 		(v) => v
			// 	);
			// 	if (!closestCell) {
			// 		return;
			// 	}
			// 	const closest = closestCell
			// 		.copy()
			// 		.mul(this.slam.occupancyGridResolution);

			// 	ctx.beginPath();
			// 	ctx.moveTo(robotPos.x, robotPos.y);
			// 	ctx.lineTo(closest.x, closest.y);
			// 	ctx.strokeStyle = "#f0f";
			// 	ctx.lineWidth = 1;
			// 	ctx.stroke();
			// });

			if (this.displaySettings.currentPath && this.currentPath) {
				saved(() => {
					if (!this.currentPath) {
						return;
					}
					ctx.strokeStyle = "#f0f";
					ctx.lineWidth = 2;
					ctx.beginPath();
					ctx.moveTo(this.currentPath[0].x, this.currentPath[0].y);
					for (const point of this.currentPath) {
						ctx.lineTo(point.x, point.y);
					}
					ctx.stroke();
				});
			}

			// Draw guided exploration target if set
			saved(() => {
				if (this.#guidedExplorationTarget) {
					const target = this.#guidedExplorationTarget;
					ctx.save();
					ctx.beginPath();
					ctx.arc(target.x, target.y, 4, 0, Math.PI * 2);
					ctx.strokeStyle = "#0ff";
					ctx.lineWidth = 2;
					ctx.stroke();
					ctx.beginPath();
					ctx.moveTo(target.x - 6, target.y);
					ctx.lineTo(target.x + 6, target.y);
					ctx.moveTo(target.x, target.y - 6);
					ctx.lineTo(target.x, target.y + 6);
					ctx.strokeStyle = "#0ff";
					ctx.lineWidth = 1.5;
					ctx.stroke();
					ctx.restore();
				}
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
		if (!this.robot) {
			return;
		}
		const wheelWidth = 1;
		ctx.fillRect(
			-0.5 * this.robot.wheelConfig.trackWidth - wheelWidth,
			-this.robot.wheelConfig.radius,
			wheelWidth,
			2 * this.robot.wheelConfig.radius
		);
		ctx.fillRect(
			0.5 * this.robot.wheelConfig.trackWidth,
			-this.robot.wheelConfig.radius,
			wheelWidth,
			2 * this.robot.wheelConfig.radius
		);
	}
}

function getPathfindConfig(
	slam: Slam,
	robotPosition: Vec,
	base: Pick<AStarConfig<Vec, void>, "heuristic" | "isGoal">
) {
	const nodes = new Map<string, Vec>();
	const config: AStarConfig<Vec, void> = {
		...base,
		cost: ({ from, to }) => {
			const dist = Vec.distance(from, to);
			const nodeCost = (node: Vec) => {
				const coord = Vec.from(node.vec).div(slam.occupancyGridResolution);
				const wall = slam.occupancyGrids.bin.get(coord);
				if (wall !== 0) {
					return 10_000;
				}
				const prob = slam.occupancyGrids.prob.get(coord);
				if (!prob) {
					return 200;
				}

				let cost = 0;

				// cost += 20 / (Vec.distance(node, robotPosition) / 20) ** 2;

				const drivable = slam.occupancyGrids.drivable.get(coord);
				if (!drivable) {
					cost += 100;
				}
				/** Approaches 1 the bigger prob.weight is */
				// const confidence = 1 - 1 / Math.max(prob.weight, 1);
				/** The probability that the node is free */
				// const freeProb = (1 - prob.prob) * confidence;
				// cost += (1 - freeProb) * 20;
				return cost;
			};
			return dist + nodeCost(from) + nodeCost(to);
		},
		neighbors: function* (node) {
			for (const xo of [-1, 0, 1]) {
				for (const yo of [-1, 0, 1]) {
					if (xo === 0 && yo === 0) {
						continue;
					}
					const coord = new Vec([xo, yo]).mul(slam.occupancyGridResolution);
					const neighbor = new Vec(
						node
							.copy()
							.add(coord)
							.vec.map(
								(v) =>
									Math.round(v / slam.occupancyGridResolution) *
									slam.occupancyGridResolution
							)
					);
					const key = `${neighbor.x},${neighbor.y}`;
					const existing = nodes.get(key);
					if (existing) {
						yield { node: existing, edge: undefined };
					} else {
						const gridCoord = neighbor.copy().div(slam.occupancyGridResolution);
						const occupied = slam.occupancyGrids.bin.get(gridCoord);
						if (xo !== 0 && yo !== 0) {
							// check that both directions are free
							const xOccupied = slam.occupancyGrids.bin.get(
								gridCoord.copy().add(new Vec([-xo, 0]))
							);
							const yOccupied = slam.occupancyGrids.bin.get(
								gridCoord.copy().add(new Vec([0, -yo]))
							);
							if (xOccupied !== 0 || yOccupied !== 0) {
								continue;
							}
						}
						if (occupied === 0) {
							nodes.set(key, neighbor);
							yield {
								node: neighbor,
								edge: undefined,
							};
						}
					}
				}
			}
		},
	};
	return config;
}

function pathfindToUnexploredRegion(slam: Slam, robotPosition: Vec) {
	const start = determinePathfindingStart(slam, robotPosition);
	const aStar = new AStar(
		start,
		getPathfindConfig(slam, robotPosition, {
			heuristic: (node) => {
				const grid = slam.occupancyGrids.explore;
				const closest = grid.findClosest(
					new Vec(node.copy().div(slam.occupancyGridResolution).vec),
					(v) => v
				);
				if (!closest) {
					return 0;
				}
				return new Vec(closest.vec as [number, number])
					.mul(slam.occupancyGridResolution)
					.sub(node)
					.magnitude();
			},
			isGoal: (node) => {
				return (
					slam.occupancyGrids.explore.get(
						new Vec(
							node
								.copy()
								.div(slam.occupancyGridResolution)
								.vec.map((v) => Math.round(v))
						)
					) === true
				);
			},
		})
	);
	const result = aStar.pathfind();
	return result?.nodePath;
}
function pathfindToPosition(
	slam: Slam,
	robotPosition: Vec,
	targetPosition: Vec
) {
	const start = determinePathfindingStart(slam, robotPosition);
	const target = new Vec(
		targetPosition.vec.map(
			(v) =>
				Math.round(v / slam.occupancyGridResolution) *
				slam.occupancyGridResolution
		) as [number, number]
	);
	const aStar = new AStar(
		start,
		getPathfindConfig(slam, robotPosition, {
			heuristic: (node) => {
				return Vec.distance(node, target);
			},
			isGoal: (node) => {
				return Vec.distance(node, target) < slam.occupancyGridResolution;
			},
		})
	);
	const result = aStar.pathfind();
	return result?.nodePath;
}

function determinePathfindingStart(slam: Slam, robotPosition: Vec): Vec {
	const closestDrivable = slam.occupancyGrids.drivable.findClosest(
		robotPosition.copy().div(slam.occupancyGridResolution),
		(v) => v
	);
	if (closestDrivable) {
		return closestDrivable.mul(slam.occupancyGridResolution);
	} else {
		return robotPosition
			.copy()
			.div(slam.occupancyGridResolution)
			.toMapped((v) => Math.round(v))
			.mul(slam.occupancyGridResolution);
	}
}

type GridRenderConfig<T> = {
	gridStyle?: (level: number) =>
		| {
				show: true;
				color: string;
		  }
		| { show: false; color?: string };
	cellStyle: (value: T) => {
		show: boolean;
		shape: "rect" | "circle" | "diamond";
		style: "outline" | "fill";
		color: string;
		strokeWidth?: number;
		margin: number;
	};
};
function gridRenderer<T>(config: GridRenderConfig<T>) {
	return (ctx: CanvasRenderingContext2D, grid: Grid<T>) => {
		renderGrid(ctx, grid, config);
	};
}

function renderGrid<T>(
	ctx: CanvasRenderingContext2D,
	grid: Grid<T>,
	config: GridRenderConfig<T>,
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
		const gridStyle = config.gridStyle?.(grid.level);
		if (gridStyle?.show) {
			// ctx.strokeStyle = "#04a2";
			ctx.strokeStyle = gridStyle.color;
			ctx.lineWidth =
				((0.1 / scaleFactor) * Math.log2(grid.level / 10 + 2)) / Math.log2(2);
			ctx.strokeRect(-0.5, -0.5, 1, 1);
		}
		if (children.leaf) {
			const value = children.value;
			if (value === undefined) {
				return;
			}
			const cellStyle = config.cellStyle(value);
			if (!cellStyle.show) {
				return;
			}
			ctx.fillStyle = cellStyle.color;
			ctx.strokeStyle = cellStyle.color;
			ctx.lineWidth = (cellStyle.strokeWidth ?? 0.1) / scaleFactor;
			const margin = Math.min(cellStyle.margin / scaleFactor, 0.4);

			ctx.beginPath();
			switch (cellStyle.shape) {
				case "rect":
					ctx.rect(
						-0.5 + margin,
						-0.5 + margin,
						1 - margin * 2,
						1 - margin * 2
					);
					break;
				case "circle":
					ctx.arc(0, 0, 0.5 - margin, 0, Math.PI * 2);
					break;
				case "diamond":
					ctx.rotate(Math.PI / 4);
					const size = (1 - margin * 2) * Math.SQRT1_2;
					ctx.rect(-size / 2, -size / 2, size, size);
					break;
			}
			switch (cellStyle.style) {
				case "fill":
					ctx.fill();
					break;
				case "outline":
					ctx.stroke();
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
						renderGrid(ctx, child, config, depth + 1);
					});
				}
			}
		}
	});
}
