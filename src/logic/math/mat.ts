import { Vec2, Vec2Like, VecArray } from "./vec";

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

	mulVec2(point: Vec2) {
		const x = this.m00 * point.x + this.m01 * point.y;
		const y = this.m10 * point.x + this.m11 * point.y;
		return new Vec2([x, y]);
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

	mulVec2(point: Vec2) {
		const x = this.m00 * point.x + this.m01 * point.y + this.m02;
		const y = this.m10 * point.x + this.m11 * point.y + this.m12;
		return new Vec2([x, y]);
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
	static scale(vec: Vec2Like) {
		return new Mat3([
			[vec[0], 0, 0],
			[0, vec[1], 0],
			[0, 0, 1],
		]);
	}
	static translate(vec: Vec2Like) {
		return new Mat3([
			[1, 0, vec[0]],
			[0, 1, vec[1]],
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
export function mulVecMatArray(vec: VecArray, mat: MatArray): VecArray {
	if (vec.length !== mat.length) {
		throw new Error(
			"Matrix and vector dimensions do not match for multiplication"
		);
	}
	const result: VecArray = [];
	for (let i = 0; i < vec.length; i++) {
		result[i] = 0;
		for (let j = 0; j < mat[0].length; j++) {
			result[i] += vec[j] * mat[j][i];
		}
	}
	return result;
}
