import { LitElement, css, html } from "lit";
import { customElement } from "lit/decorators.js";
import { createRef, ref } from "lit/directives/ref.js";
import { Simulation } from "../logic/simulation";
import { Vec } from "../logic/math/vec";
import { rotoTranslateCtx, savedState } from "../logic/rendering";
import { RobotController } from "../logic/robot-controller";
import { RotoTranslation } from "../logic/math/roto-translation";

@customElement("simulation-renderer")
export class SimulationRenderer extends LitElement {
	#canvasRef = createRef<HTMLCanvasElement>();
	#animationFrameId: number | null = null;

	simulation = new Simulation();
	robotController = new RobotController(this.simulation.robot);
	frameCount = 0;

	scaleLevel = 0;

	lastRenderTime = 0;

	constructor() {
		super();
		setTimeout(() => {
			this.robotController.run();
		}, 500);
	}

	render() {
		return html`<canvas
				id="canvas"
				${ref(this.#canvasRef)}
				@wheel=${this.#onWheel}
			></canvas>
			<div class="buttons">
				<button
					@click=${() => {
						this.robotController.slam.updateOccupancyGrid();
						this.robotController.currentPath = undefined;
					}}
				>
					Update Occupancy Grid
				</button>
			</div>`;
	}

	connectedCallback(): void {
		super.connectedCallback();
		if (!this.#animationFrameId) {
			this.#animationFrameId = requestAnimationFrame(
				this.animationRender.bind(this)
			);
		}
	}

	disconnectedCallback(): void {
		super.disconnectedCallback();
		if (this.#animationFrameId) {
			cancelAnimationFrame(this.#animationFrameId);
			this.#animationFrameId = null;
		}
	}

	#onWheel(event: WheelEvent) {
		event.preventDefault();
		const wheelDeltaFactor =
			event.deltaMode === event.DOM_DELTA_PIXEL
				? 120
				: event.deltaMode === event.DOM_DELTA_LINE
				? 3
				: 1;
		const delta = event.deltaY / wheelDeltaFactor;
		this.scaleLevel += -delta * 0.2;
	}

	animationRender(timestamp: number) {
		this.#animationFrameId = requestAnimationFrame(
			this.animationRender.bind(this)
		);

		const timeSinceLastRender = timestamp - this.lastRenderTime;
		const t =
			timeSinceLastRender > 1_000 ? 1 / 1000 : timeSinceLastRender / 1000;
		this.lastRenderTime = timestamp;

		const canvas = this.#canvasRef.value;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const { clientWidth, clientHeight } = canvas;
		canvas.width = clientWidth * window.devicePixelRatio;
		canvas.height = clientHeight * window.devicePixelRatio;

		this.simulation.camera.scale = 2 ** this.scaleLevel;
		this.robotController.camera.scale = 2 ** this.scaleLevel;

		ctx.clearRect(0, 0, clientWidth, clientHeight);

		const splitX = clientWidth * 0.5;

		const saved = savedState(ctx);
		saved(() => {
			ctx.beginPath();
			ctx.rect(0, 0, splitX, clientHeight);
			ctx.clip();
			this.simulation.render(ctx, new Vec([splitX, clientHeight]), t);
		});
		saved(() => {
			ctx.translate(splitX, 0);
			ctx.beginPath();
			ctx.rect(0, 0, clientWidth - splitX, clientHeight);
			ctx.clip();
			this.robotController.render(
				ctx,
				new Vec([clientWidth - splitX, clientHeight]),
				t
			);
		});

		ctx.beginPath();
		ctx.moveTo(splitX, 0);
		ctx.lineTo(splitX, clientHeight);
		ctx.strokeStyle = "#fff";
		ctx.lineWidth = 1;
		ctx.stroke();

		const currentRobotPoseEstimate =
			this.robotController.slam.poseGraph.getNodeEstimate(
				this.robotController.slam.poseId
			);
		const currentRobotPoseEstimateWithRecentOdometry = RotoTranslation.combine(
			currentRobotPoseEstimate,
			this.robotController.odometrySinceLastRecord.rotoTranslation
		);
		const initialRobotPoseEstimate =
			this.robotController.slam.poseGraph.getNodeEstimate(0);
		const currentRobotPose = this.simulation.robot.transform;
		const relativePose = RotoTranslation.relative(
			currentRobotPoseEstimateWithRecentOdometry,
			initialRobotPoseEstimate
		);
		const robotEstimateError = RotoTranslation.relative(
			relativePose,
			currentRobotPose
		);
		saved(() => {
			ctx.translate(clientWidth - 100, clientHeight - 100);
			ctx.scale(1, -1);

			ctx.globalCompositeOperation = "lighter";

			const drawTriangle = () => {
				ctx.beginPath();
				ctx.moveTo(-4, -5);
				ctx.lineTo(0, 10);
				ctx.lineTo(4, -5);
				ctx.fill();
			};

			saved(() => {
				ctx.fillStyle = "#f42";
				rotoTranslateCtx(ctx, robotEstimateError);
				drawTriangle();
			});

			ctx.fillStyle = "#0bd";
			drawTriangle();
		});
	}

	static styles = css`
		#canvas {
			width: 100%;
			height: 100%;
			background-color: #000;
		}

		.buttons {
			position: absolute;
			bottom: 0;
			left: 0;
			margin: 0.3em;
		}
	`;
}
