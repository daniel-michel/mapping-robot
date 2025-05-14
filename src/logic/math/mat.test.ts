import { assertAlmostEquals } from "jsr:@std/assert";
import { Mat2Array, svd2x2 } from "./mat.ts";

const assertAlmostEqualMatrix = (
	a: number[][],
	b: number[][],
	message = "Matrices are not equal",
	epsilon = 1e-6
) => {
	for (let i = 0; i < a.length; i++) {
		for (let j = 0; j < a[i].length; j++) {
			assertAlmostEquals(
				a[i][j],
				b[i][j],
				epsilon,
				`${message} at [${i}][${j}]: ${a[i][j]} !== ${b[i][j]}`
			);
		}
	}
};

Deno.test({
	name: "matrix",
	fn: async (t) => {
		await t.step("svd", async (t) => {
			const mat: Mat2Array = [
				[0.7352730803474561, 0.12218450340333309],
				[-0.6615291663199646, 0.3434162454858072],
			];
			const svd = svd2x2(mat);
			const { U, Vt } = svd;
			assertAlmostEqualMatrix(
				U,
				[
					[-0.70710678, 0.70710678],
					[0.70710678, 0.70710678],
				],
				"U matrix is not equal"
			);
			assertAlmostEqualMatrix(
				Vt,
				[
					[-0.98768834, 0.15643447],
					[0.15643447, 0.98768834],
				],
				"Vt matrix is not equal"
			);
		});
		await t.step("svd", async (t) => {
			const mat: Mat2Array = [
				[0.5230301683483496, 0.5310320127384534],
				[-0.7370433423217515, -0.11100750918175292],
			];
			const svd = svd2x2(mat);
			const { U, Vt } = svd;
			assertAlmostEqualMatrix(
				U,
				[
					[-0.70710678, 0.70710678],
					[0.70710678, 0.70710678],
				],
				"U matrix is not equal"
			);
			assertAlmostEqualMatrix(
				Vt,
				[
					[-0.89100652, -0.4539905],
					[-0.4539905, 0.89100652],
				],
				"Vt matrix is not equal"
			);
		});
	},
});
