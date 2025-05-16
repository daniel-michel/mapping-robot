import { assertAlmostEqualRotoTranslation } from "./math/roto-translation.test.ts";
import { RotoTranslation } from "./math/roto-translation.ts";
import { Vec2 } from "./math/vec.ts";
import { computeRotoTranslation } from "./scan-matching.ts";

Deno.test({
	name: "scan-matching",
	fn: async (t) => {
		await t.step(
			"roto-translation for point correspondences 0.2",
			async (t) => {
				const points = [new Vec2([0, 0]), new Vec2([1, 0]), new Vec2([0, 1])];
				const transform = new RotoTranslation(Math.PI * 0.2, [1, 5]);
				const transformedPoints = points.map((p) => transform.apply(p));
				const determinedTransform = computeRotoTranslation(
					points,
					transformedPoints
				);
				assertAlmostEqualRotoTranslation(
					determinedTransform,
					transform,
					"determined transform should be the same as original"
				);
			}
		);
		await t.step(
			"roto-translation for point correspondences 0.4",
			async (t) => {
				const points = [new Vec2([0, 0]), new Vec2([1, 0]), new Vec2([0, 1])];
				const transform = new RotoTranslation(Math.PI * 0.4, [1, 5]);
				const transformedPoints = points.map((p) => transform.apply(p));
				const determinedTransform = computeRotoTranslation(
					points,
					transformedPoints
				);
				assertAlmostEqualRotoTranslation(
					determinedTransform,
					transform,
					"determined transform should be the same as original"
				);
			}
		);
		await t.step(
			"roto-translation for point correspondences 0.6",
			async (t) => {
				const points = [new Vec2([0, 0]), new Vec2([1, 0]), new Vec2([0, 1])];
				const transform = new RotoTranslation(Math.PI * 0.6, [1, 5]);
				const transformedPoints = points.map((p) => transform.apply(p));
				const determinedTransform = computeRotoTranslation(
					points,
					transformedPoints
				);
				assertAlmostEqualRotoTranslation(
					determinedTransform,
					transform,
					"determined transform should be the same as original"
				);
			}
		);
		await t.step(
			"roto-translation for point correspondences 0.8",
			async (t) => {
				const points = [new Vec2([0, 0]), new Vec2([1, 0]), new Vec2([0, 1])];
				const transform = new RotoTranslation(Math.PI * 0.8, [1, 5]);
				const transformedPoints = points.map((p) => transform.apply(p));
				const determinedTransform = computeRotoTranslation(
					points,
					transformedPoints
				);
				assertAlmostEqualRotoTranslation(
					determinedTransform,
					transform,
					"determined transform should be the same as original"
				);
			}
		);
		await t.step("roto-translation for point correspondences 1", async (t) => {
			const points = [new Vec2([0, 0]), new Vec2([1, 0]), new Vec2([0, 1])];
			const transform = new RotoTranslation(Math.PI * 1, [1, 5]);
			const transformedPoints = points.map((p) => transform.apply(p));
			const determinedTransform = computeRotoTranslation(
				points,
				transformedPoints
			);
			assertAlmostEqualRotoTranslation(
				determinedTransform,
				transform,
				"determined transform should be the same as original"
			);
		});
		await t.step(
			"roto-translation for point correspondences 1.5",
			async (t) => {
				const points = [new Vec2([0, 0]), new Vec2([1, 0]), new Vec2([0, 1])];
				const transform = new RotoTranslation(Math.PI * 1.5, [1, 5]);
				const transformedPoints = points.map((p) => transform.apply(p));
				const determinedTransform = computeRotoTranslation(
					points,
					transformedPoints
				);
				assertAlmostEqualRotoTranslation(
					determinedTransform,
					transform,
					"determined transform should be the same as original"
				);
			}
		);
		await t.step("roto-translation for point correspondences 2", async (t) => {
			const points = [new Vec2([0, 0]), new Vec2([1, 0]), new Vec2([0, 1])];
			const transform = new RotoTranslation(Math.PI * 2, [1, 5]);
			const transformedPoints = points.map((p) => transform.apply(p));
			const determinedTransform = computeRotoTranslation(
				points,
				transformedPoints
			);
			assertAlmostEqualRotoTranslation(
				determinedTransform,
				transform,
				"determined transform should be the same as original"
			);
		});
	},
});
