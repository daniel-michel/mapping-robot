import { Mat3 } from "./math/mat";
import { interpolateAngle } from "./math/util";
import { Vec2 } from "./math/vec";
import { RangingSensorScan } from "./robot";

export type Constraint = {
	nodes: [number, number];
	translation: Vec2;
	rotation: number;
	strength: number;
};

export class PoseGraph {
	constraints: Constraint[] = [];
	constraintsByNode: Map<number, Constraint[]> = new Map();
	nodeEstimates: Map<number, { position: Vec2; orientation: number }> =
		new Map();

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
			return {
				position: new Vec2([0, 0]),
				orientation: 0,
			};
		}
		return estimate;
	}
	getNodeEstimateMat(node: number) {
		const estimate = this.getNodeEstimate(node);
		const mat = Mat3.translate(estimate.position).mul(
			Mat3.rotation(estimate.orientation)
		);
		return mat;
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
				if (!isFirst) {
					const orientation = otherEstimate.orientation + constraint.rotation;
					const position = otherEstimate.position
						.copy()
						.add(
							constraint.translation.copy().rotate(otherEstimate.orientation)
						);
					return {
						orientation,
						position,
						strength: constraint.strength,
					};
				} else {
					const orientation = otherEstimate.orientation - constraint.rotation;
					const position = otherEstimate.position
						.copy()
						.add(constraint.translation.copy().mul(-1).rotate(orientation));
					return {
						orientation,
						position,
						strength: constraint.strength,
					};
				}
			})
			.filter((v) => v !== undefined);
		if (locations.length < 1) {
			const estimate = this.nodeEstimates.get(node);
			if (!estimate) {
				this.nodeEstimates.set(node, {
					orientation: 0,
					position: new Vec2([0, 0]),
				});
			}
			return;
		}
		let orientation = 0;
		let position = new Vec2([0, 0]);
		let strength = 0;
		for (const loc of locations) {
			strength += loc.strength;
			orientation = interpolateAngle(
				orientation,
				loc.orientation,
				loc.strength / strength
			);
			position = Vec2.interpolate(
				position,
				loc.position,
				loc.strength / strength
			);
		}
		this.nodeEstimates.set(node, {
			orientation,
			position,
		});
	}
}

export type Surface = Vec2[];

export class Slam {
	poseGraph = new PoseGraph();

	#surfaceThreshold = 20;

	scans: Map<number, { scan: RangingSensorScan; surfaces: Surface[] }> =
		new Map();
	poseId = 0;

	move(translation: Vec2, rotation: number) {
		const newPoseId = this.poseId + 1;
		const constraint: Constraint = {
			nodes: [this.poseId, newPoseId],
			translation: translation.copy(),
			rotation,
			strength: 0.1,
		};
		this.poseGraph.addConstraint(constraint);
		this.poseId = newPoseId;
		return this.poseId;
	}
	addScan(scan: RangingSensorScan) {
		const points = scan.distances.map((d, i) => {
			const angle = scan.angleStep * i - scan.angle / 2;
			const direction = new Vec2([0, 1]).rotate(angle);
			return direction.mul(d);
		});
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
			scan: scan,
			surfaces: surfaces,
		});
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
