import { PriorityQueue } from "./data-structures/priority-queue.ts";

export type AStarConfig<N, E> = {
	heuristic: (node: N) => number;
	cost: (connection: { edge: E; from: N; to: N }) => number;
	neighbors: (node: N) => Iterable<{ node: N; edge: E }>;
	isGoal: (node: N) => boolean;
};
type AStarNodeWrapper<N, E> = {
	node: N;
	from?: {
		node: N;
		edge: E;
	};
	/** Cost from the start */
	gcost: number;
	/** Heuristic cost to the goal */
	hcost: number;
	/** gcost + hcost */
	fcost: number;
	closed?: boolean;
};

export class AStar<N, E> {
	nodes: Map<N, AStarNodeWrapper<N, E>> = new Map();

	openList = new PriorityQueue<AStarNodeWrapper<N, E>>(
		(a, b) => a.fcost - b.fcost
	);

	constructor(
		public readonly start: N,
		public readonly config: AStarConfig<N, E>
	) {
		Object.freeze(config);
	}

	updateNodeWrapper(node: N, from: { node: N; edge: E }) {
		const existing = this.nodes.get(node);
		if (existing?.closed) {
			return;
		}
		const cost = this.config.cost({
			edge: from.edge,
			from: from.node,
			to: node,
		});
		const gcost = (this.nodes.get(from.node)?.gcost ?? 0) + cost;
		const hcost = existing?.hcost ?? this.config.heuristic(node);
		const fcost = gcost + hcost;
		if (existing && existing.fcost < fcost) {
			return;
		}
		const wrapper =
			existing ??
			({
				node,
				gcost,
				hcost,
				fcost,
			} satisfies AStarNodeWrapper<N, E>);
		wrapper.gcost = gcost;
		wrapper.hcost = hcost;
		wrapper.fcost = fcost;
		wrapper.from = from;
		this.nodes.set(node, wrapper);
		this.openList.insert(wrapper);
	}

	createStartWrapper() {
		const exists = this.nodes.has(this.start);
		if (exists) {
			return;
		}
		const hcost = this.config.heuristic(this.start);
		const wrapper = {
			node: this.start,
			gcost: 0,
			hcost,
			fcost: hcost,
		} satisfies AStarNodeWrapper<N, E>;
		this.nodes.set(this.start, wrapper);
		this.openList.insert(wrapper);
	}

	pathfind() {
		this.createStartWrapper();
		while (true) {
			const node = this.openList.pop();
			if (!node) {
				return undefined;
			}
			if (node.closed) {
				continue;
			}
			node.closed = true;
			if (this.config.isGoal(node.node)) {
				const edgePath: E[] = [];
				const nodePath: N[] = [];
				let current: AStarNodeWrapper<N, E> | undefined = node;
				while (current) {
					nodePath.unshift(current.node);
					if (current.from) {
						edgePath.unshift(current.from.edge);
					}
					current = current.from?.node && this.nodes.get(current.from?.node);
				}
				return {
					edgePath,
					nodePath,
				};
			}
			const neighbors = this.config.neighbors(node.node);
			for (const neighbor of neighbors) {
				this.updateNodeWrapper(neighbor.node, {
					node: node.node,
					edge: neighbor.edge,
				});
			}
		}
	}
}
