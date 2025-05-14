import { assertAlmostEquals } from "jsr:@std/assert";
import { RotoTranslation } from "./roto-translation.ts";
import { Vec2 } from "./vec.ts";
import { angleNormalize } from "./util.ts";

export const assertAlmostEqualRotoTranslation = (
	a: RotoTranslation,
	b: RotoTranslation,
	message: string
) => {
	assertAlmostEquals(
		angleNormalize(a.rotation),
		angleNormalize(b.rotation),
		1e-7,
		`${message} rotation should be the same`
	);
	assertAlmostEquals(
		a.translation.x,
		b.translation.x,
		1e-7,
		`${message} translation x should be the same`
	);
	assertAlmostEquals(
		a.translation.y,
		b.translation.y,
		1e-7,
		`${message} translation y should be the same`
	);
};

Deno.test({
	name: "roto-translation",
	fn: async (t) => {
		await t.step("inverse", () => {
			const p = new Vec2([1, 2]);
			const transform = new RotoTranslation(Math.PI / 5, [1, 5]);
			const transformed = transform.apply(p);
			const inverse = transform.inverse();
			const transformedBack = inverse.apply(transformed);
			assertAlmostEquals(
				transformedBack.x,
				p.x,
				0.00001,
				"transformed back x should be the same"
			);
			assertAlmostEquals(
				transformedBack.y,
				p.y,
				0.00001,
				"transformed back y should be the same"
			);
		});
		await t.step("double inverse", () => {
			const transform = new RotoTranslation(Math.PI / 5, [1, 5]);
			const inverse = transform.inverse();
			const doubleInverse = inverse.inverse();
			assertAlmostEqualRotoTranslation(
				doubleInverse,
				transform,
				"double inverse should be the same as original"
			);
		});
		await t.step("matrix", () => {
			const transform = new RotoTranslation(Math.PI / 5, [1, 5]);
			const matrix = transform.matrix();
			const p = new Vec2([1, 2]);
			const transformed = transform.apply(p);
			const transformedWithMatrix = matrix.mulVec2(p);
			assertAlmostEquals(
				transformed.x,
				transformedWithMatrix.x,
				0.00001,
				"transformed x should be the same"
			);
			assertAlmostEquals(
				transformed.y,
				transformedWithMatrix.y,
				0.00001,
				"transformed y should be the same"
			);
		});
		await t.step("relative roto-translation", () => {
			const transform = new RotoTranslation(Math.PI / 5, [1, 5]);
			const relativeTransform = new RotoTranslation(Math.PI / 10, [3, 4]);
			const combined = RotoTranslation.combine(transform, relativeTransform);
			const separated = RotoTranslation.relative(combined, transform);
			assertAlmostEqualRotoTranslation(
				separated,
				relativeTransform,
				"separated should be the same as relative transform"
			);
		});
		await t.step("symmetric interpolation", async (t) => {
			const a = new RotoTranslation(Math.PI / 5, [1, 5]);
			const b = new RotoTranslation(Math.PI / 10, [3, 4]);
			const time = 0.3;
			const interpolated = RotoTranslation.interpolate(a, b, time);
			await t.step("inverted time", () => {
				const interpolatedBack = RotoTranslation.interpolate(b, a, 1 - time);
				assertAlmostEqualRotoTranslation(
					interpolatedBack,
					interpolated,
					"interpolated with switched order and inverted time"
				);
			});
			await t.step("inverted transformations", () => {
				const interpolatedInverse = RotoTranslation.interpolate(
					a.inverse(),
					b.inverse(),
					time
				).inverse();
				const interpolatedBackInverse = RotoTranslation.interpolate(
					b.inverse(),
					a.inverse(),
					1 - time
				).inverse();
				assertAlmostEqualRotoTranslation(
					interpolatedInverse,
					interpolated,
					"interpolated with inverted transformations"
				);
				assertAlmostEqualRotoTranslation(
					interpolatedBackInverse,
					interpolated,
					"interpolated with switched order and inverted transformations and time"
				);
			});
		});
	},
});
