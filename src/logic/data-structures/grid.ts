import { Vec } from "../math/vec.ts";
import { PriorityQueue } from "./priority-queue.ts";

export class Grid<T> {
	readonly dimensions: number;
	readonly maxChildren: number;
	level: number;
	parent: Grid<T> | null = null;
	children:
		| { leaf: true; value: T | undefined }
		| { leaf: false; nodes: (Grid<T> | undefined)[] } = {
		leaf: true,
		value: undefined,
	};

	constructor(dimensions: number, level: number = 0) {
		this.dimensions = dimensions;
		this.maxChildren = 3 ** dimensions;
		this.level = level;
	}

	#split() {
		if (!this.children.leaf) {
			throw new Error("Already split");
		}
		if (this.level === 0) {
			throw new Error("Cannot split level zero");
		}
		const newChildren = [];
		for (let i = 0; i < 3 ** this.dimensions; i++) {
			const child = (newChildren[i] = new Grid<T>(
				this.dimensions,
				this.level - 1
			));
			child.parent = this;
			child.#unify(this.children.value);
		}
		this.children = {
			leaf: false,
			nodes: newChildren,
		};
	}

	#unify(value: T | undefined) {
		this.children = {
			leaf: true,
			value,
		};
	}

	set(coord: Vec, value: T) {
		const cell = this.getCell(coord);
		cell.#unify(value);
		this.simplifyCell(coord);
	}
	clear(coord: Vec) {
		const cell = this.getCell(coord);
		cell.#unify(undefined);
		this.simplifyCell(coord);
	}
	get(coord: Vec): T | undefined {
		const relativeCoord = this.#toRelativeCoordinate(coord);
		const childIndex = calculateCoordinateIndex(relativeCoord);
		if (relativeCoord.iter().some((coord) => Math.abs(coord) > 1)) {
			return undefined;
		} else if (this.children.leaf) {
			return this.children.value;
		} else {
			return this.children.nodes[childIndex]?.get(
				this.#subtractRelativeCoordinate(coord, relativeCoord)
			);
		}
	}

	findClosest(
		coord: Vec,
		predicate: (value: T) => boolean,
		options?: { minDistance?: number; maxDistance?: number }
	): Vec | undefined {
		const found = this.traverseOutward(coord, options).find(
			({ cell }) =>
				cell.children.leaf &&
				cell.children.value !== undefined &&
				predicate(cell.children.value)
		);
		return found?.coord;
	}

	map<U>(fn: (value: T) => U | undefined): Grid<U> {
		const newGrid = new Grid<U>(this.dimensions, this.level);
		if (this.children.leaf) {
			newGrid.#unify(
				this.children.value !== undefined ? fn(this.children.value) : undefined
			);
		} else {
			newGrid.children = {
				leaf: false,
				nodes: this.children.nodes.map((child) => child?.map(fn)),
			};
			for (const child of newGrid.children.nodes) {
				if (child) {
					child.parent = newGrid;
				}
			}
		}
		newGrid.#tryUnify();
		return newGrid;
	}

	/**
	 * The method is only applied to grid cells that have a value
	 * @param fn
	 * @returns
	 */
	convolve<U>(
		fn: (
			value: T,
			getNeighbor: (offset: number[]) => T | undefined
		) => U | undefined
	): Grid<U> {
		const newGrid = new Grid<U>(this.dimensions, this.level);
		for (const { node, coord } of this.traverseLeafs()) {
			// if the node is not at level zero (a single grid tile) all single grid tiles need to be iterated
			const size = 3 ** node.level;
			const centerOffset = Math.floor(size / 2);
			const count = size ** this.dimensions;
			for (let i = 0; i < count; i++) {
				// since calculateIndexCoordinate starts at -1, 1 has to be added again
				const offset = calculateIndexCoordinate(i, this.dimensions).toMapped(
					(c) => c + 1 - centerOffset
				);
				const currentCoord = coord.toMapped((c, i) => c + offset.at(i));
				const newValue = fn(node.children.value, (offset: number[]) => {
					const neighborCoord = currentCoord.toMapped((c, i) => c + offset[i]);
					return this.get(neighborCoord);
				});
				if (newValue !== undefined) {
					newGrid.set(currentCoord, newValue);
				}
			}
		}
		return newGrid;
	}

	*traverseLeafs(): Generator<{
		node: Grid<T> & { children: { leaf: true; value: T } };
		coord: Vec;
	}> {
		if (this.children.leaf) {
			if (this.children.value !== undefined) {
				yield {
					node: this as any,
					coord: Vec.zero(this.dimensions),
				};
			}
		} else {
			for (let i = 0; i < this.children.nodes.length; i++) {
				const child = this.children.nodes[i];
				if (!child) {
					continue;
				}
				const relativeCoord = this.#relativeOffsetToAbsolute(
					calculateIndexCoordinate(i, this.dimensions)
				);
				yield* child.traverseLeafs().map((leaf) => ({
					...leaf,
					coord: leaf.coord.toMapped((c, j) => c + relativeCoord.at(j)),
				}));
			}
		}
	}

	*traverseOutward(
		coord: Vec,
		options?: { minDistance?: number; maxDistance?: number }
	): Generator<{ coord: Vec; level: number; cell: Grid<T> }> {
		const { minDistance = 0, maxDistance = Infinity } = options ?? {};
		const visited = new Set<Grid<T>>();
		const start = coord.copy();

		const queue = new PriorityQueue<{
			coord: Vec;
			dist: number;
			level: number;
		}>((a, b) => a.dist - b.dist);
		queue.insert({
			coord: start.copy().round(),
			dist: 0,
			level: this.level,
		});

		while (queue.length > 0) {
			const { coord, dist } = queue.pop()!;
			if (dist > maxDistance) continue;
			const result = this.getCellContaining(coord);
			if (!result) continue;
			const { cell, coord: offsetFromCellCenter } = result;
			if (visited.has(cell)) continue;
			visited.add(cell);
			const level = cell.level;

			if (dist >= minDistance) {
				yield { coord, level, cell };
			}

			// Generate neighbors in all directions just over the edge of the current cell
			for (let d = 0; d < this.dimensions; d++) {
				for (const delta of [-1, 1]) {
					const neighbor = coord.copy();
					neighbor.vec[d] +=
						delta * (level > 0 ? Math.round(3 ** level * 0.5 + 0.5) : 1) -
						offsetFromCellCenter.at(d);
					const neighborDist = Vec.distance(neighbor, start);
					if (neighborDist > maxDistance) continue;
					queue.insert({ coord: neighbor, dist: neighborDist, level });
				}
			}
			// Add all the children of the current cell to the queue
			if (!cell.children.leaf) {
				for (let i = 0; i < this.maxChildren; i++) {
					const child = cell.children.nodes[i];
					if (!child) continue;
					const offset = calculateIndexCoordinate(i, this.dimensions).mul(
						3 ** (level - 1)
					);

					const childCenter = coord
						.copy()
						.sub(offsetFromCellCenter)
						.add(offset);
					// Calculate the child's min and max tile position that is just within the child
					const childMin = childCenter
						.copy()
						.sub(Math.round(3 ** (level - 1) * 0.5 - 0.5));
					const childMax = childCenter
						.copy()
						.add(Math.round(3 ** (level - 1) * 0.5 - 0.5));
					// choose the coordinate within the child that is the closest to the start coordinate
					const childCoord = start.copy().clamp(childMin, childMax);
					const childDist = Vec.distance(childCoord, start);
					if (childDist > maxDistance) continue;
					queue.insert({
						coord: childCoord,
						dist: childDist,
						level: level - 1,
					});
				}
			}
		}
		return undefined;
	}

	getCell(coord: Vec): Grid<T> {
		const relativeCoord = this.#toRelativeCoordinate(coord);
		const childIndex = calculateCoordinateIndex(relativeCoord);
		if (relativeCoord.iter().some((coord) => Math.abs(coord) > 1)) {
			// elevate the level of this node and move the children into a new child node
			const newChild = new Grid<T>(this.dimensions, this.level);
			this.level++;
			newChild.children = this.children;
			if (!newChild.children.leaf) {
				for (const child of newChild.children.nodes) {
					if (child) {
						child.parent = newChild;
					}
				}
			}
			this.children = {
				leaf: false,
				nodes: [],
			};
			this.children.nodes[
				calculateCoordinateIndex(relativeCoord.toMapped(() => 0))
			] = newChild;
			newChild.parent = this;
			return this.getCell(coord);
		} else if (this.level === 0) {
			// this is where the leaf is
			return this;
		} else {
			// go to child (may need to be created)
			if (this.children.leaf) {
				this.#split();
			}
			if (this.children.leaf) {
				throw new Error(
					"This should not be possible but is needed for type checking"
				);
			}
			const child = (this.children.nodes[childIndex] ??= new Grid<T>(
				this.dimensions,
				this.level - 1
			));
			child.parent = this;
			return child.getCell(
				this.#subtractRelativeCoordinate(coord, relativeCoord)
			);
		}
	}

	// Returns the lowest-level cell containing the coordinate and the value at that coordinate
	getCellContaining(
		coord: Vec
	): { cell: Grid<T>; value: T | undefined; coord: Vec } | undefined {
		const relativeCoord = this.#toRelativeCoordinate(coord);
		const childIndex = calculateCoordinateIndex(relativeCoord);
		if (relativeCoord.iter().some((coord) => Math.abs(coord) > 1)) {
			return undefined;
		} else if (this.children.leaf || this.level === 0) {
			return {
				cell: this,
				value: this.children.leaf ? this.children.value : undefined,
				coord,
			};
		} else {
			const child = this.children.nodes[childIndex];
			if (!child) {
				return { cell: this, value: undefined, coord };
			}
			return child.getCellContaining(
				this.#subtractRelativeCoordinate(coord, relativeCoord)
			);
		}
	}

	simplify() {
		if (this.children.leaf) {
			return;
		}
		for (let i = 0; i < this.children.nodes.length; i++) {
			const child = this.children.nodes[i];
			if (child) {
				child.simplify();
				if (child.children.leaf && child.children.value === undefined) {
					delete this.children.nodes[i];
				}
			}
		}
		this.#tryUnify();
	}

	simplifyCell(coord: Vec) {
		if (this.children.leaf) {
			return;
		}
		const relativeCoord = this.#toRelativeCoordinate(coord);
		const childIndex = calculateCoordinateIndex(relativeCoord);
		if (relativeCoord.iter().some((coord) => Math.abs(coord) > 1)) {
			return;
		} else {
			this.children.nodes[childIndex]?.simplifyCell(
				this.#subtractRelativeCoordinate(coord, relativeCoord)
			);
			if (
				this.children.nodes[childIndex]?.children.leaf &&
				this.children.nodes[childIndex].children.value === undefined
			) {
				delete this.children.nodes[childIndex];
			}
			if (
				this.children.nodes[childIndex] === undefined ||
				this.children.nodes[childIndex].children.leaf
			) {
				this.#tryUnify();
			}
		}
	}

	serialize(): any {
		if (this.children.leaf) {
			return {
				leaf: true,
				value: this.children.value,
			};
		} else {
			return {
				leaf: false,
				nodes: this.children.nodes.map((child) =>
					child ? child.serialize() : undefined
				),
			};
		}
	}

	static fromSerialized<T>(
		data: any,
		dimensions: number,
		level: number
	): Grid<T> {
		const grid = new Grid<T>(dimensions, level);
		if (data.leaf) {
			grid.children = { leaf: true, value: data.value };
		} else {
			grid.children = {
				leaf: false,
				nodes: data.nodes.map((child: any) =>
					child
						? Grid.fromSerialized<T>(child, dimensions, level - 1)
						: undefined
				),
			};
			for (const child of grid.children.nodes) {
				if (child) {
					child.parent = grid;
				}
			}
		}
		return grid;
	}

	#tryUnify() {
		if (this.children.leaf) {
			return;
		}
		for (let i = 0; i < this.children.nodes.length; i++) {
			// TODO: is this needed?
			const child = this.children.nodes[i];
			if (child?.children.leaf && child.children.value === undefined) {
				delete this.children.nodes[i];
			}
		}
		if (this.children.nodes.every((node) => !node)) {
			this.#unify(undefined);
			return;
		}
		if (this.children.nodes.length !== this.maxChildren) {
			return;
		}
		const first = this.children.nodes[0];
		if (first && first.children.leaf) {
			const commonValue = first.children.value;
			for (let i = 1; i < this.maxChildren; i++) {
				const node = this.children.nodes[i];
				if (!node?.children.leaf || node.children.value !== commonValue) {
					return;
				}
			}
			this.#unify(commonValue);
		}
	}

	#toRelativeCoordinate(coord: Vec) {
		return Vec.div(coord, 3 ** (this.level - 1)).round();
	}
	#subtractRelativeCoordinate(coord: Vec, relativeCoord: Vec) {
		return Vec.sub(coord, Vec.mul(relativeCoord, 3 ** (this.level - 1)));
	}
	#relativeOffsetToAbsolute(offset: Vec) {
		return Vec.mul(offset, 3 ** (this.level - 1));
	}
}

function calculateCoordinateIndex(coord: Vec) {
	const index = coord
		.iter()
		.reduce((acc, curr, i) => acc + (curr + 1) * 3 ** i, 0);
	return index;
}
function calculateIndexCoordinate(index: number, dimensions: number) {
	const coord: number[] = new Array(dimensions).fill(0);
	for (let i = 0; i < dimensions; i++) {
		coord[i] = (index % 3) - 1;
		index = Math.floor(index / 3);
	}
	return new Vec(coord);
}
