import { Vec, VecLike } from "./vec.ts";

export type MatArray = number[][];

export type Mat2Array = [[number, number], [number, number]];
export type Mat3Array = [
	[number, number, number],
	[number, number, number],
	[number, number, number]
];

export type Mat2Like = Mat2Array | Mat2;
export type Mat3Like = Mat3Array | Mat3;

export class Mat2 {
	mat: Mat2Array;

	get [0](): [number, number] {
		return this.mat[0];
	}
	get [1](): [number, number] {
		return this.mat[1];
	}

	get m00(): number {
		return this.mat[0][0];
	}
	get m01(): number {
		return this.mat[0][1];
	}
	get m10(): number {
		return this.mat[1][0];
	}
	get m11(): number {
		return this.mat[1][1];
	}
	set m00(value: number) {
		this.mat[0][0] = value;
	}
	set m01(value: number) {
		this.mat[0][1] = value;
	}
	set m10(value: number) {
		this.mat[1][0] = value;
	}
	set m11(value: number) {
		this.mat[1][1] = value;
	}

	constructor(mat: Mat2Array) {
		this.mat = mat;
	}

	copy() {
		return new Mat2([
			[this.mat[0][0], this.mat[0][1]],
			[this.mat[1][0], this.mat[1][1]],
		]);
	}

	mul(other: Mat2Like) {
		const result = mulMatArray(this.mat, Mat2.unwrapped(other));
		return new Mat2(result as Mat2Array);
	}

	mulVec2(point: Vec) {
		const x = this.m00 * point.x + this.m01 * point.y;
		const y = this.m10 * point.x + this.m11 * point.y;
		return new Vec([x, y]);
	}

	static wrapped(mat: Mat2Like) {
		if (mat instanceof Mat2) {
			return mat;
		}
		return new Mat2(mat);
	}
	static unwrapped(mat: Mat2Like) {
		if (mat instanceof Mat2) {
			return mat.mat;
		}
		return mat;
	}
	static identity() {
		return new Mat2([
			[1, 0],
			[0, 1],
		]);
	}
	static zero() {
		return new Mat2([
			[0, 0],
			[0, 0],
		]);
	}
	static rotation(radians: number) {
		const cos = Math.cos(radians);
		const sin = Math.sin(radians);
		return new Mat2([
			[cos, -sin],
			[sin, cos],
		]);
	}
	static scale(x: number, y: number) {
		return new Mat2([
			[x, 0],
			[0, y],
		]);
	}
}

export class Mat3 {
	mat: Mat3Array;

	get [0](): { [0]: number; [1]: number; [2]: number } {
		return this.mat[0];
	}
	get [1](): { [0]: number; [1]: number; [2]: number } {
		return this.mat[1];
	}
	get [2](): { [0]: number; [1]: number; [2]: number } {
		return this.mat[2];
	}

	get m00(): number {
		return this.mat[0][0];
	}
	get m01(): number {
		return this.mat[0][1];
	}
	get m02(): number {
		return this.mat[0][2];
	}
	get m10(): number {
		return this.mat[1][0];
	}
	get m11(): number {
		return this.mat[1][1];
	}
	get m12(): number {
		return this.mat[1][2];
	}
	get m20(): number {
		return this.mat[2][0];
	}
	get m21(): number {
		return this.mat[2][1];
	}
	get m22(): number {
		return this.mat[2][2];
	}
	set m00(value: number) {
		this.mat[0][0] = value;
	}
	set m01(value: number) {
		this.mat[0][1] = value;
	}
	set m02(value: number) {
		this.mat[0][2] = value;
	}
	set m10(value: number) {
		this.mat[1][0] = value;
	}
	set m11(value: number) {
		this.mat[1][1] = value;
	}
	set m12(value: number) {
		this.mat[1][2] = value;
	}
	set m20(value: number) {
		this.mat[2][0] = value;
	}
	set m21(value: number) {
		this.mat[2][1] = value;
	}
	set m22(value: number) {
		this.mat[2][2] = value;
	}

	constructor(mat: Mat3Array) {
		this.mat = mat;
	}

	copy() {
		return new Mat3([
			[this.mat[0][0], this.mat[0][1], this.mat[0][2]],
			[this.mat[1][0], this.mat[1][1], this.mat[1][2]],
			[this.mat[2][0], this.mat[2][1], this.mat[2][2]],
		]);
	}

	mul(other: Mat3Like) {
		const result = mulMatArray(this.mat, Mat3.unwrapped(other));
		return new Mat3(result as Mat3Array);
	}

	mulVec2(point: Readonly<Vec>) {
		const x = this.m00 * point.x + this.m01 * point.y + this.m02;
		const y = this.m10 * point.x + this.m11 * point.y + this.m12;
		return new Vec([x, y]);
	}

	static wrapped(mat: Mat3Like) {
		if (mat instanceof Mat3) {
			return mat;
		}
		return new Mat3(mat);
	}
	static unwrapped(mat: Mat3Like) {
		if (mat instanceof Mat3) {
			return mat.mat;
		}
		return mat;
	}
	static identity() {
		return new Mat3([
			[1, 0, 0],
			[0, 1, 0],
			[0, 0, 1],
		]);
	}
	static zero() {
		return new Mat3([
			[0, 0, 0],
			[0, 0, 0],
			[0, 0, 0],
		]);
	}
	static fromMat2(mat: Mat2Like) {
		return new Mat3([
			[mat[0][0], mat[0][1], 0],
			[mat[1][0], mat[1][1], 0],
			[0, 0, 1],
		]);
	}
	static rotation(radians: number) {
		const cos = Math.cos(radians);
		const sin = Math.sin(radians);
		return new Mat3([
			[cos, -sin, 0],
			[sin, cos, 0],
			[0, 0, 1],
		]);
	}
	static scale(vec: VecLike) {
		const raw = Vec.unwrapped(vec);
		return new Mat3([
			[raw[0], 0, 0],
			[0, raw[1], 0],
			[0, 0, 1],
		]);
	}
	static translate(vec: VecLike) {
		const raw = Vec.unwrapped(vec);
		return new Mat3([
			[1, 0, raw[0]],
			[0, 1, raw[1]],
			[0, 0, 1],
		]);
	}
}

export function mulMatArray(a: MatArray, b: MatArray): MatArray {
	if (a[0].length !== b.length) {
		throw new Error("Matrix dimensions do not match for multiplication");
	}
	const result: MatArray = [];
	for (let i = 0; i < a.length; i++) {
		result[i] = [];
		for (let j = 0; j < b[0].length; j++) {
			result[i][j] = 0;
			for (let k = 0; k < a[0].length; k++) {
				result[i][j] += a[i][k] * b[k][j];
			}
		}
	}
	return result;
}
export function mulVecMatArray(vec: number[], mat: MatArray): number[] {
	if (vec.length !== mat.length) {
		throw new Error(
			"Matrix and vector dimensions do not match for multiplication"
		);
	}
	const result: number[] = [];
	for (let i = 0; i < vec.length; i++) {
		result[i] = 0;
		for (let j = 0; j < mat[0].length; j++) {
			result[i] += vec[j] * mat[j][i];
		}
	}
	return result;
}

export function transposeMat(mat: MatArray): MatArray {
	const result: MatArray = [];
	for (let i = 0; i < mat[0].length; i++) {
		result[i] = [];
		for (let j = 0; j < mat.length; j++) {
			result[i][j] = mat[j][i];
		}
	}
	return result;
}

/**
 * Computes the SVD of a 2x2 matrix. Returns { U, S, Vt } such that A = U * S * Vt.
 * Matches numpy.linalg.svd conventions: S in descending order, U and Vt orthogonal.
 * (Generated by Copilot)
 * @param A 2x2 matrix as [[a, b], [c, d]]
 */
export function svd2x2(A: [[number, number], [number, number]]): {
	U: Mat2Array;
	S: [number, number];
	Vt: Mat2Array;
} {
	// Compute A^T A
	const a = A[0][0],
		b = A[0][1],
		c = A[1][0],
		d = A[1][1];
	const ATA = [
		[a * a + c * c, a * b + c * d],
		[a * b + c * d, b * b + d * d],
	];
	// Eigenvalues of ATA are the squared singular values
	const tr = ATA[0][0] + ATA[1][1];
	const det = ATA[0][0] * ATA[1][1] - ATA[0][1] * ATA[1][0];
	const temp = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
	let l1 = tr / 2 + temp;
	let l2 = tr / 2 - temp;
	let s1 = Math.sqrt(Math.max(0, l1));
	let s2 = Math.sqrt(Math.max(0, l2));

	// Sort singular values in descending order, permute everything accordingly
	let swap = false;
	if (s2 > s1) {
		swap = true;
		[s1, s2] = [s2, s1];
		[l1, l2] = [l2, l1];
	}

	// Compute V (eigenvectors of ATA)
	let v1, v2;
	if (ATA[0][1] !== 0) {
		v1 = [l1 - ATA[1][1], ATA[0][1]];
		v2 = [l2 - ATA[1][1], ATA[0][1]];
	} else {
		v1 = [1, 0];
		v2 = [0, 1];
	}
	// Normalize
	const norm1 = Math.hypot(v1[0], v1[1]);
	const norm2 = Math.hypot(v2[0], v2[1]);
	v1 = [v1[0] / norm1, v1[1] / norm1];
	v2 = [v2[0] / norm2, v2[1] / norm2];

	// If swapped, swap v1/v2
	if (swap) {
		[v1, v2] = [v2, v1];
	}

	// Compute U = AV/S
	const AV1 = [a * v1[0] + b * v1[1], c * v1[0] + d * v1[1]];
	const AV2 = [a * v2[0] + b * v2[1], c * v2[0] + d * v2[1]];
	let u1: [number, number] = s1 > 1e-10 ? [AV1[0] / s1, AV1[1] / s1] : [0, 0];
	let u2: [number, number] = s2 > 1e-10 ? [AV2[0] / s2, AV2[1] / s2] : [0, 0];
	// Orthonormalize U
	const normu1 = Math.hypot(u1[0], u1[1]);
	const normu2 = Math.hypot(u2[0], u2[1]);
	u1 = normu1 > 1e-10 ? [u1[0] / normu1, u1[1] / normu1] : [1, 0];
	u2 = normu2 > 1e-10 ? [u2[0] / normu2, u2[1] / normu2] : [0, 1];

	// If swapped, swap u1/u2
	if (swap) {
		[u1, u2] = [u2, u1];
	}

	// Ensure right-handedness (determinant +1 for U and V)
	const detU = u1[0] * u2[1] - u1[1] * u2[0];
	const detV = v1[0] * v2[1] - v1[1] * v2[0];
	if (detU < 0) {
		u1 = [-u1[0], -u1[1]];
	}
	if (detV < 0) {
		v1 = [-v1[0], -v1[1]];
	}

	const U: Mat2Array = [u1, u2];
	const S: [number, number] = [s1, s2];
	const Vt: Mat2Array = [
		[v1[0], v2[0]],
		[v1[1], v2[1]],
	];
	return { U, S, Vt };
}

export function det2x2(mat: Mat2Array): number {
	return mat[0][0] * mat[1][1] - mat[0][1] * mat[1][0];
}

export function matToString(mat: MatArray): string {
	const numToString = (num: number) => {
		const str = num.toString();
		if (str.length > 8) {
			const exponent = Math.floor(Math.log10(Math.abs(num)));
			if (exponent > 7 || exponent < -3) {
				return num.toExponential(2);
			}
			const fractionDigits = Math.max(3 - exponent, 0);
			const numStr = num.toFixed(fractionDigits);
			return numStr;
		}
		return str;
	};
	const strMat = mat.map((row) => row.map(numToString));

	const columnWidths = strMat[0].map((_, i) =>
		strMat.reduce((max, row) => Math.max(max, row[i].length), 0)
	);
	const formattedRows = strMat.map(
		(row, rowI) =>
			(rowI === 0
				? strMat.length === 1
					? "("
					: "/"
				: rowI === strMat.length - 1
				? "\\"
				: "|") +
			row.map((cell, i) => cell.padStart(columnWidths[i])).join(" | ") +
			(rowI === 0
				? strMat.length === 1
					? ")"
					: "\\"
				: rowI === strMat.length - 1
				? "/"
				: "|")
	);
	return "\n" + formattedRows.join("\n");
}

export function matToArrayString(mat: MatArray) {
	return `[[${mat.map((row) => row.join(", ")).join("], [")}]]`;
}
