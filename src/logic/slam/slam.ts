import { Grid } from "../data-structures/grid.ts";
import { RotoTranslation } from "../math/roto-translation.ts";
import { Vec } from "../math/vec.ts";
import {
	generateOccupancyGrid,
	OccupancyGrid,
	OccupancyProbGrid,
	toBinaryOccupancyGrid,
} from "./occupancy-grid.ts";
import { RangingSensorScan } from "../robot/robot.ts";
import { asyncScanMatching } from "./scan-matching.ts";
import { angleDiff } from "../math/util.ts";

export type Constraint = {
	nodes: [number, number];
	transform: RotoTranslation;
	strength: number;
};

export class PoseGraph {
	constraints: Constraint[] = [];
	constraintsByNode: Map<number, Constraint[]> = new Map();
	nodeEstimates: Map<number, RotoTranslation> = new Map();

	addConstraint(constraint: Constraint) {
		this.constraints.push(constraint);
		for (const node of constraint.nodes) {
			this.#addConstraintToNode(node, constraint);
		}
		for (const node of constraint.nodes) {
			this.#optimizeNode(node);
		}
	}

	getNodeEstimate(node: number) {
		const estimate = this.nodeEstimates.get(node);
		if (!estimate) {
			return new RotoTranslation(0, [0, 0]);
		}
		return estimate;
	}
	getNodeEstimateMat(node: number) {
		const estimate = this.getNodeEstimate(node);
		return estimate.matrix();
	}

	optimize(iterations: number) {
		for (let i = 0; i < iterations; i++) {
			const visited = new Set<number>();
			const visit = (node: number) => {
				if (visited.has(node)) {
					return;
				}
				visited.add(node);
				this.#optimizeNode(node);
				const constraints = this.constraintsByNode.get(node) ?? [];
				for (const constraint of constraints) {
					const other =
						constraint.nodes[0] === node
							? constraint.nodes[1]
							: constraint.nodes[0];
					visit(other);
				}
			};
			const first = this.constraints[0]?.nodes[0];
			if (first !== undefined) {
				visit(first);
			}
		}
	}

	#addConstraintToNode(node: number, constraint: Constraint) {
		const constraints = this.constraintsByNode.get(node) ?? [];
		constraints.push(constraint);
		this.constraintsByNode.set(node, constraints);
	}

	#optimizeNode(node: number) {
		const constraints = this.constraintsByNode.get(node);
		if (!constraints) {
			return;
		}
		const locations = constraints
			.map((constraint) => {
				const isFirst = constraint.nodes[0] === node;
				const other = constraint.nodes[isFirst ? 1 : 0];
				const otherEstimate = this.nodeEstimates.get(other);
				if (!otherEstimate) {
					return;
				}
				const transform = RotoTranslation.combine(
					otherEstimate,
					!isFirst ? constraint.transform : constraint.transform.inverse()
				);
				return {
					transform,
					strength: constraint.strength,
				};
			})
			.filter((v) => v !== undefined);
		if (locations.length < 1) {
			const estimate = this.nodeEstimates.get(node);
			if (!estimate) {
				this.nodeEstimates.set(node, new RotoTranslation(0, [0, 0]));
			}
			return;
		}
		let transform = new RotoTranslation(0, [0, 0]);
		let strength = 0;
		for (const loc of locations) {
			strength += loc.strength;
			transform = RotoTranslation.interpolate(
				transform,
				loc.transform,
				loc.strength / strength
			);
		}
		this.nodeEstimates.set(node, transform);
	}
}

export type Surface = Vec[];

export class Slam {
	poseGraph = new PoseGraph();

	#surfaceThreshold = 20;

	scans: Map<number, { scan: RangingSensorScan; surfaces: Surface[] }> =
		new Map();
	poseId = 0;

	occupancyGridResolution = 10;
	occupancyGrids: {
		prob: OccupancyProbGrid;
		bin: OccupancyGrid;
		explore: Grid<true>;
	} = {
		prob: new Grid(2),
		bin: new Grid(2),
		explore: new Grid(2),
	};

	correspondences: {
		poseA: number;
		poseB: number;
		pairs: [number, number][];
	}[] = [];

	move(rotoTranslation: RotoTranslation) {
		const newPoseId = this.poseId + 1;
		const constraint: Constraint = {
			nodes: [this.poseId, newPoseId],
			transform: rotoTranslation.copy(),
			strength: 0.1,
		};
		this.poseGraph.addConstraint(constraint);
		this.poseId = newPoseId;
		return this.poseId;
	}
	addScan(scan: RangingSensorScan) {
		const points = scan.points
			.map((p) => p.point?.copy())
			.filter((p) => p !== undefined);
		const surfaces: Surface[] = [];
		for (let i = 0; i < points.length; i++) {
			const current = surfaces.at(-1);
			if (!current) {
				surfaces.push([points[i]]);
			} else {
				const last = current.at(-1);
				if (last) {
					const dist = Vec.distance(last, points[i]);
					if (dist < this.#surfaceThreshold) {
						current.push(points[i]);
					} else {
						surfaces.push([points[i]]);
					}
				} else {
					// this will never happen
					current.push(points[i]);
				}
			}
		}
		this.scans.set(this.poseId, {
			scan,
			surfaces: surfaces,
		});

		const currentPose = this.poseGraph.getNodeEstimate(this.poseId);
		const score = (id: number, transform: RotoTranslation) => {
			const expectedOverlap = this.expectedOverlapWithScanOfPose(
				id,
				RotoTranslation.relative(currentPose, transform)
			);
			if (expectedOverlap < 0.4) {
				return Infinity;
			}
			return (
				1 / expectedOverlap ** 2 +
				Vec.distanceSquared(transform.translation, currentPose.translation) *
					0.002
			);
		};
		const sorted = this.poseGraph.nodeEstimates
			.entries()
			.map(([id, estimate]) => {
				if (id === this.poseId) {
					return null;
				}
				const s = score(id, estimate);
				return { id, estimate, s };
			})
			.filter((i) => i !== null)
			.filter(({ s }) => s < 30)
			.toArray()
			.sort((a, b) => a.s - b.s);
		const best = sorted.slice(0, 5);

		Promise.all(best.map(({ id }) => this.matchScans(id, this.poseId))).then(
			() => {
				// this.updateOccupancyGrid();
			}
		);
	}

	/**
	 *
	 * @param poseId
	 * @param transform The transform where the new scan would be taken relative to the scan at poseId
	 * @returns A value in the interval [0; 1] describing the percentage of overlap
	 */
	expectedOverlapWithScanOfPose(poseId: number, transform: RotoTranslation) {
		const { scan } = this.scans.get(poseId)!;
		const angle = scan.angle;
		const inverseTransform = transform.inverse();
		const transMat = inverseTransform.matrix();
		const scanOrigin = transMat.mulVec2(new Vec([0, 0]));
		const pointsWithinNewScan = scan.points.filter(({ point }) => {
			if (!point) {
				return false;
			}
			const transformedPoint = transMat.mulVec2(point);
			const rayDirectionSimilarity = Vec.dot(
				transformedPoint.copy().mul(-1).normalize(),
				scanOrigin.copy().sub(transformedPoint).normalize()
			);
			if (rayDirectionSimilarity < 0) {
				return false;
			}
			if (transformedPoint.magnitude() > scan.distanceRange[1]) {
				return false;
			}
			if (
				Math.abs(angleDiff(transformedPoint.heading2d(), Math.PI / 2)) >
				angle / 2
			) {
				return false;
			}
			return true;
		});
		return pointsWithinNewScan.length / scan.count;
	}

	updateOccupancyGrid() {
		const scans = this.scans.entries().map(([poseId, { scan }]) => {
			const transform = this.poseGraph.getNodeEstimate(poseId);
			return {
				scan,
				transform,
			};
		});
		this.occupancyGrids.prob = generateOccupancyGrid(
			scans.toArray(),
			this.occupancyGridResolution
		);
		this.occupancyGrids.bin = toBinaryOccupancyGrid(this.occupancyGrids.prob);
		this.occupancyGrids.explore = this.occupancyGrids.bin.convolve(
			(v, getNeighbor) => {
				if (v !== 0) {
					return undefined;
				}
				for (const d of [0, 1]) {
					for (const o of [-1, 1]) {
						const coord = [0, 0];
						coord[d] = o;
						const neighbor = getNeighbor(coord);
						if (neighbor === undefined) {
							return true;
						}
					}
				}
			}
		);
	}

	async matchScans(firstPoseId: number, secondPoseId: number) {
		const firstScan = this.scans.get(firstPoseId)?.scan;
		const secondScan = this.scans.get(secondPoseId)?.scan;
		if (!firstScan || !secondScan) {
			return;
		}
		const firstPose = this.poseGraph.getNodeEstimate(firstPoseId);
		const secondPose = this.poseGraph.getNodeEstimate(secondPoseId);
		const reverseTransform = RotoTranslation.relative(secondPose, firstPose);
		const {
			transform: improvedTransform,
			converged,
			error,
			overlap,
		} = await asyncScanMatching(firstScan, secondScan, reverseTransform);
		console.log({
			converged,
			error,
			overlap,
			confidence: (overlap / error) * 10,
		});
		this.poseGraph.addConstraint({
			nodes: [firstPoseId, secondPoseId],
			transform: improvedTransform,
			// strength: converged ? 0.5 : 0.1,
			strength: (overlap / error) * 10 * (converged ? 0.5 : 1),
		});
		// this.poseGraph.optimize(5);

		// const correspondences = correspondenceMatch(
		// 	firstScan,
		// 	secondScan,
		// 	RotoTranslation.relative(
		// 		this.poseGraph.getNodeEstimate(secondPoseId),
		// 		this.poseGraph.getNodeEstimate(firstPoseId)
		// 	)
		// ).toArray();
		// const pairs = correspondences
		// 	.map((i, j) => {
		// 		const a = i !== null ? firstScan.points[i].point : null;
		// 		const b = secondScan.points[j].point;
		// 		if (!a || !b) {
		// 			return null;
		// 		}
		// 		return [i, j] as const;
		// 	})
		// 	.filter((i) => i !== null);
		// this.correspondences.push({
		// 	poseA: firstPoseId,
		// 	poseB: secondPoseId,
		// 	pairs: pairs as [number, number][],
		// });
	}

	getAbsoluteSurfaces() {
		const absoluteSurfaces: Surface[] = [];
		for (const [poseId, { surfaces }] of this.scans) {
			const transform = this.poseGraph.getNodeEstimateMat(poseId);
			for (const surface of surfaces) {
				const transformedSurface = surface.map((point) => {
					const transformed = transform.mulVec2(point);
					return transformed;
				});
				absoluteSurfaces.push(transformedSurface);
			}
		}
		return absoluteSurfaces;
	}
}
