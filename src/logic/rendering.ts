import { interpolateAngle } from "./math/util";
import { Vec2 } from "./math/vec";
import { Camera } from "./simulation";

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
	target: {
		position: Vec2;
		orientation: number;
	},
	time: number
) {
	camera.position = Vec2.interpolate(
		camera.position,
		target.position,
		Math.min(0.001 / time, 1)
	);
	camera.orientation = interpolateAngle(
		camera.orientation,
		target.orientation,
		Math.min(0.001 / time, 1)
	);
	return camera;
}
