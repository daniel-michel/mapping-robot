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
			this.#tryUnify();
		}
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
}

function calculateCoordinateIndex(coordinates: number[]) {
	const index = coordinates.reduce(
		(acc, curr, i) => acc + (curr + 1) * 3 ** i,
		0
	);
	return index;
}
