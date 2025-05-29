import { RotoTranslation } from "./math/roto-translation";
import { interpolateAngle } from "./math/util";
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
		Math.min(0.001 / time, 1)
	);
	camera.transform.rotation = interpolateAngle(
		camera.transform.rotation,
		target.rotation,
		Math.min(0.001 / time, 1)
	);
	return camera;
}
