export function clamp(value: number, [min, max]: [number, number]) {
	return Math.min(Math.max(value, min), max);
}
export function mod(value: number, mod: number) {
	return ((value % mod) + mod) % mod;
}
export function interpolate(
	first: number,
	second: number,
	interpolation: number
): number {
	return first * (1 - interpolation) + second * interpolation;
}
/**
 * The result of this function is such that 1 - f(a + b) = (1 - f(a)) * (1 - f(b))
 */
export function intToward(time: number) {
	// 1 - f(a + b) = (1 - f(a)) * (1 - f(b))
	return Math.exp(-time);
}
export function interpolateAngle(
	first: number,
	second: number,
	interpolation: number
): number {
	const diff = mod(second - first, Math.PI * 2);
	if (diff > Math.PI) {
		return interpolate(first, first + diff - Math.PI * 2, interpolation);
	} else {
		return interpolate(first, first + diff, interpolation);
	}
}
export function angleDiffAbs(first: number, second: number): number {
	const diff = mod(second - first, Math.PI * 2);
	if (diff > Math.PI) {
		return Math.PI * 2 - diff;
	} else {
		return diff;
	}
}
export function angleDiff(first: number, second: number): number {
	const diff = mod(second - first, Math.PI * 2);
	if (diff > Math.PI) {
		return diff - Math.PI * 2;
	} else {
		return diff;
	}
}

export function random([min, max]: [number, number]) {
	return (
		((Math.random() + Math.random() + Math.random()) / 3) * (max - min) + min
	);
}
