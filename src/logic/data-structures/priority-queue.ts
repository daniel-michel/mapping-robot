export class PriorityQueue<T> {
	#data: T[] = [];
	#compare;
	#length: number = 0;

	constructor(compare: (a: T, b: T) => number) {
		this.#compare = compare;
	}

	get length() {
		return this.#length;
	}

	insert(key: T) {
		this.#data[this.#length] = key;
		this.#siftUp(this.#length);
		this.#length++;
	}

	pop(): T | undefined {
		if (this.#length === 0) {
			return;
		}
		const ret = this.#data[0];
		this.#length--;
		this.#data[0] = this.#data[this.#length];
		this.#data.pop();
		this.#siftDown(0);
		return ret;
	}

	min(): T | undefined {
		if (this.#length === 0) {
			return undefined;
		}
		return this.#data[0];
	}

	#siftUp(i: number) {
		while (
			i > 0 &&
			this.#compare(this.#data[Math.floor((i - 1) / 2)], this.#data[i]) > 0
		) {
			this.#swap(i, Math.floor((i - 1) / 2));
			i = Math.floor((i - 1) / 2);
		}
	}

	#siftDown(i: number) {
		let m;
		while (2 * i + 1 < this.#length) {
			if (2 * i + 2 >= this.#length) {
				m = 2 * i + 1;
			} else {
				if (this.#compare(this.#data[2 * i + 1], this.#data[2 * i + 2]) < 0)
					m = 2 * i + 1;
				else m = 2 * i + 2;
			}
			if (this.#compare(this.#data[i], this.#data[m]) <= 0) {
				return;
			}
			this.#swap(i, m);
			i = m;
		}
	}

	#swap(i: number, j: number) {
		[this.#data[i], this.#data[j]] = [this.#data[j], this.#data[i]];
	}
}
