export const DEG_TO_RAD = Math.PI / 180;

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
 * Can be used to determine an amount of interpolation based on time such that doing one interpolation with a big time step will have the same result as two interpolations of smaller time steps that sum up to the same.
 * The result of this function is such that 1 - f(a + b) = (1 - f(a)) * (1 - f(b))
 */
export function intToward(time: number) {
	return 1 - Math.exp(-time);
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
export function angleNormalize(angle: number): number {
	return mod(angle, Math.PI * 2);
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
	const diff = mod(first - second, Math.PI * 2);
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
