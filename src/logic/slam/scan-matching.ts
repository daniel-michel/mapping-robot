import {
	det2x2,
	Mat2,
	Mat2Array,
	mulMatArray,
	svd2x2,
	transposeMat,
} from "../math/mat.ts";
import { RotoTranslation } from "../math/roto-translation.ts";
import { angleDiff, angleNormalize } from "../math/util.ts";
import { Vec } from "../math/vec.ts";
import { RangingSensorScan } from "../robot/robot.ts";

self.addEventListener("message", (e: MessageEvent) => {
	switch (e.data.action) {
		case "scanMatching": {
			const result = scanMatching(
				{
					...e.data.scanA,
					points: e.data.scanA.points.map((point: { point?: number[] }) => ({
						...point,
						point: point.point && new Vec(point.point),
					})),
				},
				{
					...e.data.scanB,
					points: e.data.scanB.points.map((point: { point?: number[] }) => ({
						...point,
						point: point.point && new Vec(point.point),
					})),
				},
				new RotoTranslation(
					...(e.data.initialTransform as [number, [number, number]])
				)
			);
			self.postMessage({
				...result,
				transform: [
					result.transform.rotation,
					[...result.transform.translation],
				],
			});
			break;
		}
	}
});

export function asyncScanMatching(
	scanA: RangingSensorScan,
	scanB: RangingSensorScan,
	initialTransform: RotoTranslation
) {
	return new Promise<{
		transform: RotoTranslation;
		converged: boolean;
		error: number;
		overlap: number;
	}>((resolve) => {
		const worker = new Worker(new URL("./scan-matching.js", import.meta.url), {
			type: "module",
		});
		worker.addEventListener("message", (e) => {
			worker.terminate();
			resolve({
				...e.data,
				transform: new RotoTranslation(
					...(e.data.transform as [number, [number, number]])
				),
			});
		});
		worker.postMessage({
			action: "scanMatching",
			scanA: {
				...scanA,
				points: scanA.points.map((point) => ({
					...point,
					point: point.point && [...point.point],
				})),
			},
			scanB: {
				...scanB,
				points: scanB.points.map((point) => ({
					...point,
					point: point.point && [...point.point],
				})),
			},
			initialTransform: [
				initialTransform.rotation,
				[...initialTransform.translation],
			],
		});
	});
}

export function scanMatching(
	scanA: RangingSensorScan,
	scanB: RangingSensorScan,
	initialTransform: RotoTranslation
) {
	let transform = initialTransform.copy();

	const MAX_ITERATIONS = 50;
	let previousCorrespondences: (number | null)[] = [];
	let converged = false;
	let error = Infinity;
	// e (xi) is the percentage of least trimmed squares that are considered to be overlapping
	let e = 1;

	for (let i = 0; i < MAX_ITERATIONS; i++) {
		const currentTransformMatrix = transform.matrix();
		const scanBTransformed = scanB.points.map(
			({ point }) => point && currentTransformMatrix.mulVec2(point)
		);

		const correspondences = correspondenceMatch(
			scanA,
			scanB,
			transform
		).toArray();

		if (
			previousCorrespondences.length === correspondences.length &&
			previousCorrespondences.every((v, i) => v === correspondences[i])
		) {
			// No change in correspondences, break the loop
			console.log("Converged after", i, "iterations");
			converged = true;
			break;
		}
		previousCorrespondences = correspondences;

		const pointPairs = correspondences
			.map((i, j) => {
				const a = i !== null ? scanA.points[i].point : null;
				const b = scanB.points[j].point;
				const bTransformed = scanBTransformed[j];
				if (!a || !b || !bTransformed) {
					return null;
				}
				return {
					aPoint: a,
					bPoint: b,
					aIndex: i,
					bIndex: j,
					distSquared: Vec.distanceSquared(a, bTransformed),
				};
			})
			.filter((i) => i !== null);

		// Use the algorithm described by "The Trimmed Iterative Closest Point Algorithm" to trim away pairs with too square distance errors
		pointPairs.sort((a, b) => a.distSquared - b.distSquared);

		const mse = (set: { distSquared: number }[]) =>
			set.reduce((acc, { distSquared }) => acc + distSquared, 0) / set.length;
		// lambda >= 0 (higher values can help avoid undesirable alignments of symmetric and featureless parts of the point sets)
		const lambda = 2;
		// e should be chosen such that this function is minimized
		const psi = (e: number) =>
			mse(pointPairs.slice(0, Math.round(pointPairs.length * e))) *
			e ** -(1 + lambda);
		let currentMin = Infinity;
		for (let x = 0.4; x <= 1; x += 0.05) {
			const val = psi(x);
			if (val < currentMin) {
				e = x;
				currentMin = val;
			}
		}

		const bestPairs = pointPairs.slice(0, Math.round(pointPairs.length * e));
		error = mse(bestPairs);

		const sourcePoints = bestPairs.map(({ bPoint }) => bPoint);
		const targetPoints = bestPairs.map(({ aPoint }) => aPoint);
		const rotoTranslation = computeRotoTranslation(sourcePoints, targetPoints);
		transform = rotoTranslation;
	}
	if (!converged) {
		console.warn("Scan matching did not converge");
	}

	return { transform, converged, error, overlap: e };
}

export function sampleGradient<T extends number[]>(
	values: T,
	func: (values: T) => number,
	e = 0.001
) {
	const gradient = Array.from(values, () => 0) as T;
	for (let i = 0; i < values.length; i++) {
		const vn = values.slice() as T;
		vn[i] -= e * 0.5;
		const vp = values.slice() as T;
		vp[i] += e * 0.5;
		const n = func(vn);
		const p = func(vp);
		const g = (p - n) / e;
		gradient[i] = g;
	}
	return gradient;
}

/**
 *
 * Implementation based on: An ICP variant using a point-to-line metric (Appendix II: Fast Correspondence Search)
 * @returns for each point in scanB, the index of the closest point in scanA
 */
export function* correspondenceMatch(
	scanA: RangingSensorScan,
	scanB: RangingSensorScan,
	transform: RotoTranslation
) {
	const transMat = transform.matrix();
	const pw = scanB.points.map((point) =>
		point.point ? transMat.mulVec2(point.point) : null
	);

	let lastBest: number | null = null;

	for (const pwi of pw.filter((p) => p !== null)) {
		let best: number | null = null;
		let bestDist = Infinity;

		const pwiAngle = pwi.heading2d() - Math.PI / 2; // the heading is the angle from the x-axis but the scan is centered on the y-axis and using the angle from the y-axis
		const startIndex = Math.floor(
			angleNormalize(
				angleDiff(pwiAngle, scanA.points[0].angle) * (scanA.count / scanA.angle)
			)
		);
		const weStartAt: number = lastBest !== null ? lastBest + 1 : startIndex;
		// let up = Math.max(0, weStartAt + 1);
		// let down = Math.min(scanA.points.length - 1, weStartAt);
		let up = weStartAt + 1;
		let down = scanA.points.length - 1;
		let lastDistUp = Infinity;
		let lastDistDown = Infinity;
		let upStopped = false;
		let downStopped = false;

		while (!(upStopped && downStopped)) {
			let nowUp = !upStopped && (lastDistUp < lastDistDown || downStopped); // TODO: can it not happen that downStopped is true and lastDistUp is greater lastDistDown?
			if (nowUp) {
				if (up >= scanA.count || up < 0) {
					upStopped = true;
					continue;
				}
				const current = scanA.points[up];
				if (!current.point) {
					up++;
					continue;
				}
				lastDistUp = pwi.copy().sub(current.point).magnitudeSquared();
				// FIXME: what does "correspondence is acceptable" mean?
				if (/* correspondence is acceptable && */ lastDistUp < bestDist) {
					best = up;
					bestDist = lastDistUp;
				}
				if (up > startIndex) {
					const deltaPhi = angleDiff(current.angle, pwiAngle);
					const minDistUp = Math.sin(deltaPhi) * pwi.magnitude();
					if (minDistUp ** 2 > bestDist) {
						upStopped = true;
						continue;
					}
					up++; // TODO: implement jump table
				} else {
					up++;
				}
			} else {
				if (down < 0 || down >= scanA.count) {
					downStopped = true;
					continue;
				}
				const current = scanA.points[down];
				if (!current.point) {
					down--;
					continue;
				}
				lastDistDown = pwi.copy().sub(current.point).magnitudeSquared();
				// FIXME: what does "correspondence is acceptable" mean?
				if (/* correspondence is acceptable && */ lastDistDown < bestDist) {
					best = down;
					bestDist = lastDistDown;
				}
				if (down < startIndex) {
					const deltaPhi = angleDiff(current.angle, pwiAngle);
					const minDistDown = Math.sin(deltaPhi) * pwi.magnitude();
					if (minDistDown ** 2 > bestDist) {
						downStopped = true;
						continue;
					}
					down--; // TODO: implement jump table
				} else {
					down--;
				}
			}
		}
		lastBest = best;
		yield best;
	}
}

/**
 * Computes the optimal rotation matrix and translation vector that aligns two sets of 2D points.
 * @param P Array of Vec points (source)
 * @param Q Array of Vec points (target)
 * @returns { rotation: number, translation: Vec }
 */
export function computeRotoTranslation(P: Vec[], Q: Vec[]) {
	if (P.length !== Q.length) {
		throw new Error("Point sets must have the same length");
	}
	const n = P.length;
	// Compute centroids
	const centroidP = P.reduce((acc, p) => acc.add(p), new Vec([0, 0])).mul(
		1 / n
	);
	const centroidQ = Q.reduce((acc, q) => acc.add(q), new Vec([0, 0])).mul(
		1 / n
	);

	// Center the points
	const P_centered = P.map((p) => p.copy().sub(centroidP));
	const Q_centered = Q.map((q) => q.copy().sub(centroidQ));

	// Compute covariance matrix H
	// H = P_centered.T @ Q_centered
	const H = mulMatArray(
		transposeMat(P_centered.map((p) => [p.x, p.y])),
		Q_centered.map((q) => [q.x, q.y])
	) as Mat2Array;

	// Calculate the Singular Value Decomposition (SVD) of H
	const { U, Vt } = svd2x2(H);
	// console.log(matToArrayString(H), matToArrayString(U), matToArrayString(Vt));
	// Compute the rotation matrix
	// let R: Mat2Array = mulMatArray(
	// 	transposeMat(Vt),
	// 	transposeMat(U)
	// ) as Mat2Array;
	let R: Mat2Array = mulMatArray(U, Vt) as Mat2Array;
	// Ensure a proper rotation (det(R) = 1)
	if (det2x2(R) < 0) {
		console.warn("Reflection detected, correcting...");
		U[0][1] = -U[0][1];
		U[1][1] = -U[1][1];
		R = mulMatArray(U, Vt) as Mat2Array;
	}

	// Compute the rotation angle
	const theta = Math.atan2(R[1][0], R[0][0]);
	// Compute the translation vector
	const translation = centroidQ.copy().sub(new Mat2(R).mulVec2(centroidP));

	return new RotoTranslation(theta, translation);
}
