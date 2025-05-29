import { clamp } from "../math/util.ts";
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

	set(value: T, coordinates: number[]) {
		const cell = this.getCell(coordinates);
		cell.#unify(value);
		this.simplifyCell(coordinates);
	}
	clear(coordinates: number[]) {
		const cell = this.getCell(coordinates);
		cell.#unify(undefined);
		this.simplifyCell(coordinates);
	}
	get(coordinates: number[]): T | undefined {
		const relativeCoordinates = this.#toRelativeCoordinates(coordinates);
		const childIndex = calculateCoordinateIndex(relativeCoordinates);
		if (relativeCoordinates.some((coord) => Math.abs(coord) > 1)) {
			return undefined;
		} else if (this.children.leaf) {
			return this.children.value;
		} else {
			return this.children.nodes[childIndex]?.get(
				this.#subtractRelativeCoordinates(coordinates, relativeCoordinates)
			);
		}
	}

	findClosest(
		coordinates: number[],
		predicate: (value: T) => boolean,
		options?: { minDistance?: number; maxDistance?: number }
	): number[] | undefined {
		const found = this.traverseOutward(coordinates, options).find(
			({ cell }) =>
				cell.children.leaf &&
				cell.children.value !== undefined &&
				predicate(cell.children.value)
		);
		return found?.coords;
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
		for (const { node, coords } of this.traverseLeafs()) {
			// if the node is not at level zero (a single grid tile) all single grid tiles need to be iterated
			const size = 3 ** node.level;
			const centerOffset = Math.floor(size / 2);
			const count = size ** this.dimensions;
			for (let i = 0; i < count; i++) {
				// since calculateIndexCoordinate starts at -1, 1 has to be added again
				const offset = calculateIndexCoordinate(i, this.dimensions).map(
					(c) => c + 1 - centerOffset
				);
				// TODO refactor with Vec(N) class
				const currentCoords = coords.map((c, i) => c + offset[i]);
				const newValue = fn(node.children.value, (offset: number[]) => {
					const neighborCoords = currentCoords.map((c, i) => c + offset[i]);
					return this.get(neighborCoords);
				});
				if (newValue !== undefined) {
					newGrid.set(newValue, currentCoords);
				}
			}
		}
		return newGrid;
	}

	*traverseLeafs(): Generator<{
		node: Grid<T> & { children: { leaf: true; value: T } };
		coords: number[];
	}> {
		if (this.children.leaf) {
			if (this.children.value !== undefined) {
				yield { node: this as any, coords: new Array(this.dimensions).fill(0) };
			}
		} else {
			for (let i = 0; i < this.children.nodes.length; i++) {
				const child = this.children.nodes[i];
				if (!child) {
					continue;
				}
				const relativeCoords = this.#relativeOffsetToAbsolute(
					calculateIndexCoordinate(i, this.dimensions)
				);
				yield* child.traverseLeafs().map((leaf) => ({
					...leaf,
					coords: leaf.coords.map((c, j) => c + relativeCoords[j]),
				}));
			}
		}
	}

	*traverseOutward(
		coordinates: number[],
		options?: { minDistance?: number; maxDistance?: number }
	): Generator<{ coords: number[]; level: number; cell: Grid<T> }> {
		const { minDistance = 0, maxDistance = Infinity } = options ?? {};
		const visited = new Set<Grid<T>>();
		const start = coordinates.slice();

		function euclidean(a: number[], b: number[]): number {
			return Math.sqrt(a.reduce((sum, ai, i) => sum + (ai - b[i]) ** 2, 0));
		}

		const queue = new PriorityQueue<{
			coords: number[];
			dist: number;
			level: number;
		}>((a, b) => a.dist - b.dist);
		queue.insert({
			coords: start.map((v) => Math.round(v)),
			dist: 0,
			level: this.level,
		});

		while (queue.length > 0) {
			const { coords, dist } = queue.pop()!;
			if (dist > maxDistance) continue;
			const result = this.getCellContaining(coords);
			if (!result) continue;
			const { cell, coordinates: offsetFromCellCenter } = result;
			if (visited.has(cell)) continue;
			visited.add(cell);
			const level = cell.level;

			if (dist >= minDistance) {
				yield { coords, level, cell };
			}

			// Generate neighbors in all directions just over the edge of the current cell
			for (let d = 0; d < this.dimensions; d++) {
				for (const delta of [-1, 1]) {
					const neighbor = coords.slice();
					neighbor[d] +=
						delta * (level > 0 ? Math.round(3 ** level * 0.5 + 0.5) : 1) -
						offsetFromCellCenter[d];
					const neighborDist = euclidean(neighbor, start);
					if (neighborDist > maxDistance) continue;
					queue.insert({ coords: neighbor, dist: neighborDist, level });
				}
			}
			// Generate "neighbors" for all children of the current cell
			if (!cell.children.leaf) {
				for (let i = 0; i < this.maxChildren; i++) {
					const child = cell.children.nodes[i];
					if (!child) continue;
					const offset = calculateIndexCoordinate(i, this.dimensions).map(
						(v) => v * 3 ** (level - 1)
					);

					const neighbor = coords.map((c, j) => {
						const min =
							c -
							offsetFromCellCenter[j] +
							offset[j] -
							Math.round(3 ** (level - 1) * 0.5 - 0.5);
						const max =
							c -
							offsetFromCellCenter[j] +
							offset[j] +
							Math.round(3 ** (level - 1) * 0.5 - 0.5);
						return clamp(start[j], [min, max]);
					});
					const neighborDist = euclidean(neighbor, start);
					if (neighborDist > maxDistance) continue;
					queue.insert({
						coords: neighbor,
						dist: neighborDist,
						level: level - 1,
					});
				}
			}
		}
		return undefined;
	}

	getCell(coordinates: number[]): Grid<T> {
		const relativeCoordinates = this.#toRelativeCoordinates(coordinates);
		const childIndex = calculateCoordinateIndex(relativeCoordinates);
		if (relativeCoordinates.some((coord) => Math.abs(coord) > 1)) {
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
				calculateCoordinateIndex(relativeCoordinates.map(() => 0))
			] = newChild;
			newChild.parent = this;
			return this.getCell(coordinates);
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
				this.#subtractRelativeCoordinates(coordinates, relativeCoordinates)
			);
		}
	}

	// Returns the lowest-level cell containing the coordinate and the value at that coordinate
	getCellContaining(
		coordinates: number[]
	):
		| { cell: Grid<T>; value: T | undefined; coordinates: number[] }
		| undefined {
		const relativeCoordinates = this.#toRelativeCoordinates(coordinates);
		const childIndex = calculateCoordinateIndex(relativeCoordinates);
		if (relativeCoordinates.some((coord) => Math.abs(coord) > 1)) {
			return undefined;
		} else if (this.children.leaf || this.level === 0) {
			return {
				cell: this,
				value: this.children.leaf ? this.children.value : undefined,
				coordinates,
			};
		} else {
			const child = this.children.nodes[childIndex];
			if (!child) {
				return { cell: this, value: undefined, coordinates };
			}
			return child.getCellContaining(
				this.#subtractRelativeCoordinates(coordinates, relativeCoordinates)
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

	simplifyCell(coordinates: number[]) {
		if (this.children.leaf) {
			return;
		}
		const relativeCoordinates = this.#toRelativeCoordinates(coordinates);
		const childIndex = calculateCoordinateIndex(relativeCoordinates);
		if (relativeCoordinates.some((coord) => Math.abs(coord) > 1)) {
			return;
		} else {
			this.children.nodes[childIndex]?.simplifyCell(
				this.#subtractRelativeCoordinates(coordinates, relativeCoordinates)
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

	#toRelativeCoordinates(coordinates: number[]) {
		return coordinates.map((c) => Math.round(c / 3 ** (this.level - 1)));
	}
	#subtractRelativeCoordinates(coords: number[], relativeCoords: number[]) {
		return coords.map((c, i) => c - relativeCoords[i] * 3 ** (this.level - 1));
	}
	#relativeOffsetToAbsolute(offset: number[]) {
		return offset.map((o) => o * 3 ** (this.level - 1));
	}
}

function calculateCoordinateIndex(coordinates: number[]) {
	const index = coordinates.reduce(
		(acc, curr, i) => acc + (curr + 1) * 3 ** i,
		0
	);
	return index;
}
function calculateIndexCoordinate(index: number, dimensions: number) {
	const coordinates: number[] = new Array(dimensions).fill(0);
	for (let i = 0; i < dimensions; i++) {
		coordinates[i] = (index % 3) - 1;
		index = Math.floor(index / 3);
	}
	return coordinates;
}
