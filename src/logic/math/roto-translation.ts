import { Mat3 } from "./mat.ts";
import { angleDiff, angleNormalize } from "./util.ts";
import { Vec } from "./vec.ts";

export class RotoTranslation {
	rotation: number;
	translation: Vec;

	constructor(rotation: number, translation: Vec | number[]) {
		this.rotation = rotation;
		this.translation = Vec.wrapped(translation);
	}

	copy(): RotoTranslation {
		return new RotoTranslation(this.rotation, this.translation.copy());
	}

	apply(point: Vec): Vec {
		return point.copy().rotate2d(this.rotation).add(this.translation);
	}
	toInverted(): RotoTranslation {
		return new RotoTranslation(
			-this.rotation,
			this.translation.copy().rotate2d(-this.rotation).mul(-1)
		);
	}
	matrix(): Mat3 {
		const cos = Math.cos(this.rotation);
		const sin = Math.sin(this.rotation);
		return new Mat3([
			[cos, -sin, this.translation.x],
			[sin, cos, this.translation.y],
			[0, 0, 1],
		]);
	}
	/**
	 * Apply rotation to the frame of reference after the transformation.
	 */
	rotateRelative(rotation: number): RotoTranslation {
		this.rotation += rotation;
		return this;
	}
	translateRelative(translation: Vec): RotoTranslation {
		this.translation.add(translation.copy().rotate2d(this.rotation));
		return this;
	}
	/**
	 * Apply rotation to the frame of reference before the transformation.
	 */
	rotateGlobal(rotation: number): RotoTranslation {
		this.rotation += rotation;
		this.translation.rotate2d(rotation);
		return this;
	}
	translateGlobal(translation: Vec): RotoTranslation {
		this.translation.add(translation);
		return this;
	}

	/**
	 * Combines two roto-translations such that the result is equivalent to applying
	 * the first roto-translation and then the second roto-translation.
	 */
	static combine(a: RotoTranslation, b: RotoTranslation): RotoTranslation {
		const rotation = a.rotation + b.rotation;
		const translation = a.translation
			.copy()
			.add(b.translation.copy().rotate2d(a.rotation));
		return new RotoTranslation(rotation, translation);
	}

	/**
	 * Subtracts roto-translation b from a such that applying the result to
	 * roto-translation b is equivalent to applying roto-translation a.
	 * In other words, the result is the transformation from b to a.
	 */
	static relative(a: RotoTranslation, b: RotoTranslation): RotoTranslation {
		const rotation = angleDiff(a.rotation, b.rotation);
		const translation = a.translation
			.copy()
			.sub(b.translation)
			.rotate2d(-b.rotation);
		return new RotoTranslation(rotation, translation);
	}

	mul(s: number) {
		if (angleNormalize(this.rotation) === 0) {
			this.translation.mul(s);
			return this;
		}

		const translationMagnitude = this.translation.magnitude();
		const translationAngle = this.translation.heading2d();
		const refVec = new Vec([0, 1]).rotate2d(this.rotation).sub([0, 1]);
		const refDistance = refVec.magnitude();
		const refAngle = angleDiff(refVec.heading2d(), Math.PI / 2);
		const partialAngle = angleDiff(this.rotation, 0) * s;
		const radius = -translationMagnitude / refDistance;

		const relativeX = -(Math.cos(partialAngle) - 1) * radius;
		const relativeY = Math.sin(partialAngle) * -radius;
		const relative = new Vec([relativeX, relativeY]);
		this.translation = relative.rotate2d(-refAngle + translationAngle);
		this.rotation *= s;
		return this;
	}

	static interpolate(
		a: RotoTranslation,
		b: RotoTranslation,
		t: number
	): RotoTranslation {
		return RotoTranslation.combine(a, RotoTranslation.relative(b, a).mul(t));
	}
}
