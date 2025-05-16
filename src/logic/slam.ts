import { Grid } from "./grid.ts";
import { RotoTranslation } from "./math/roto-translation.ts";
import { Vec2 } from "./math/vec.ts";
import { generateOccupancyGrid, OccupancyGrid } from "./occupancy-grid.ts";
import { RangingSensorScan } from "./robot.ts";
import { asyncScanMatching } from "./scan-matching.ts";

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
			return new RotoTranslation(0, new Vec2([0, 0]));
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
				this.nodeEstimates.set(node, new RotoTranslation(0, new Vec2([0, 0])));
			}
			return;
		}
		let transform = new RotoTranslation(0, new Vec2([0, 0]));
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

export type Surface = Vec2[];

export class Slam {
	poseGraph = new PoseGraph();

	#surfaceThreshold = 20;

	scans: Map<number, { scan: RangingSensorScan; surfaces: Surface[] }> =
		new Map();
	poseId = 0;

	occupancyGridResolution = 10;
	occupancyGrid: OccupancyGrid = new Grid(2);

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
			// transform: new RotoTranslation(0, new Vec2([0, 0])),
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
					const dist = Vec2.distance(last, points[i]);
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
		const score = (id: number, transform: RotoTranslation) =>
			Vec2.distanceSquared(transform.translation, currentPose.translation) +
			id * 5;
		const sorted = this.poseGraph.nodeEstimates
			.entries()
			.map(([id, estimate]) => {
				const s = score(id, estimate);
				return { id, estimate, s };
			})
			.filter(({ id }) => id !== this.poseId)
			.toArray()
			.sort((a, b) => a.s - b.s);
		const best = sorted.slice(0, 2);
		for (const { id } of best) {
			this.matchScans(id, this.poseId);
		}
	}

	updateOccupancyGrid() {
		const scans = this.scans.entries().map(([poseId, { scan }]) => {
			const transform = this.poseGraph.getNodeEstimate(poseId);
			return {
				scan,
				transform,
			};
		});
		this.occupancyGrid = generateOccupancyGrid(
			scans.toArray(),
			this.occupancyGridResolution
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
		const { transform: improvedTransform, converged } = await asyncScanMatching(
			firstScan,
			secondScan,
			reverseTransform
		);
		this.poseGraph.addConstraint({
			nodes: [firstPoseId, secondPoseId],
			transform: improvedTransform,
			strength: converged ? 0.5 : 0.1,
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
		// for (const [poseId, { surfaces }] of this.scans
		// 	.entries()
		// 	.toArray()
		// 	.slice(-2)) {
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
