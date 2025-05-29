import { RotoTranslation } from "./math/roto-translation";
import { clamp, interpolateAngle, intToward } from "./math/util";
import { Vec } from "./math/vec";

export type Camera = {
	transform: RotoTranslation;
	scale: number;
};

export function rotoTranslateCtx(
	ctx: CanvasRenderingContext2D,
	transform: RotoTranslation
) {
	ctx.translate(transform.translation.x, transform.translation.y);
	ctx.rotate(transform.rotation);
}

export const savedState =
	(ctx: CanvasRenderingContext2D) => (callback: () => void) => {
		ctx.save();
		try {
			callback();
		} finally {
			ctx.restore();
		}
	};

export function interpolateCamera(
	camera: Camera,
	target: RotoTranslation,
	time: number
) {
	camera.transform.translation = Vec.interpolate(
		camera.transform.translation,
		target.translation,
		intToward(time * 2 * camera.scale)
	);
	camera.transform.rotation = interpolateAngle(
		camera.transform.rotation,
		target.rotation,
		intToward(time * 2 * clamp(camera.scale, [1, 10]))
	);
	return camera;
}
