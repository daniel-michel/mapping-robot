interface LcgParameters {
	readonly m: number;
	readonly a: number;
	readonly c: number;
}
interface LcgParametersWithOutputBitRange extends LcgParameters {
	readonly outputBitRange: readonly [number, number];
}

const gccParameters = {
	m: 2 ** 31,
	a: 1103515245,
	c: 12345,
	outputBitRange: [0, 30],
} as const;

export const lcgNext = (
	state: number,
	{ m, a, c }: LcgParameters = gccParameters
) => (a * state + c) % m;

export function createLcg(
	seed: number,
	parameters: LcgParametersWithOutputBitRange = gccParameters
) {
	const { m, a, c, outputBitRange } = parameters;
	const rightShift = outputBitRange[0];
	const exclusiveLimit = 1 << (outputBitRange[1] - outputBitRange[0]);
	const bitMask = exclusiveLimit - 1;
	let state = seed;
	return {
		next() {
			state = (a * state + c) % m;
			return (state >> rightShift) & bitMask;
		},
		nextFloat() {
			return this.next() / exclusiveLimit;
		},
		fork() {
			const state = this.next();
			return createLcg(state ^ (a * state + c) % m, parameters);
		},
	};
}

export function lcgResult(
	state: number,
	parameters: LcgParametersWithOutputBitRange
) {
	const { outputBitRange } = parameters;
	const rightShift = outputBitRange[0];
	const exclusiveLimit = 1 << (outputBitRange[1] - outputBitRange[0]);
	const bitMask = exclusiveLimit - 1;
	return (state >> rightShift) & bitMask;
}

export function lcgFloat(
	seed: number,
	parameters: LcgParametersWithOutputBitRange = gccParameters
) {
	const { outputBitRange } = parameters;
	const exclusiveLimit = 1 << (outputBitRange[1] - outputBitRange[0]);
	return lcgResult(seed, parameters) / exclusiveLimit;
}

export function lcgCombine(
	seeds: number[],
	parameters: LcgParameters = gccParameters
) {
	const { m, a, c } = parameters;
	let state = 0;
	for (const seed of seeds) {
		state ^= seed;
		state = (a * state + c) % m;
	}
	return state;
}

export function hashValue(obj: unknown): number {
	if (!isObject(obj)) {
		return hashNumbers([hashString(typeof obj), hashString(String(obj))]);
	}
	if (Array.isArray(obj)) {
		return hashNumbers(obj.map(hashValue));
	}
	const strHash = hashString(String(obj));
	const keys = Object.keys(obj).sort() as (keyof typeof obj)[];
	return hashNumbers(
		keys
			.map((key) => hashNumbers([hashString(key), hashValue(obj[key])]))
			.concat(strHash)
	);
}

export function hashString(str: string): number {
	return hashNumbers(str[Symbol.iterator]().map((char) => char.charCodeAt(0)));
}

export function hashNumbers(numbers: Iterable<number>): number {
	let hash = 102895681;
	for (const num of numbers) {
		hash = (hash << 5) - hash + num;
		hash |= 0;
	}
	return hash;
}

function isObject(obj: unknown): obj is object {
	return obj !== null && (typeof obj === "object" || typeof obj === "function");
}
