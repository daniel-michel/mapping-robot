import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { createRef, ref } from "lit/directives/ref.js";
import { Simulation } from "../logic/simulation";
import { Vec } from "../logic/math/vec";
import { rotoTranslateCtx, savedState } from "../logic/rendering";
import { RobotController } from "../logic/robot-controller";
import { RotoTranslation } from "../logic/math/roto-translation";
import { ArduinoRobot } from "../logic/robot/arduino-robot.ts";
import { classMap } from "lit/directives/class-map.js";

@customElement("simulation-renderer")
export class SimulationRenderer extends LitElement {
	#canvasRef = createRef<HTMLCanvasElement>();
	#animationFrameId: number | null = null;

	@property()
	mode: "simulation" | "physical" = "simulation";

	simulation = new Simulation();
	simulationRobotController = new RobotController(this.simulation.robot);
	physicalRoboter: ArduinoRobot = new ArduinoRobot();
	physicalRobotController?: RobotController;
	frameCount = 0;

	get currentController() {
		return this.mode === "simulation"
			? this.simulationRobotController
			: this.physicalRobotController;
	}

	scaleLevel = 0;

	lastRenderTime = 0;

	constructor() {
		super();
	}

	render() {
		return html` <div class="settings-panel">
				${this.currentController
					? html`${Object.entries(RobotController.SettingDescriptions).map(
							([key, label]) => html`<label>
								<input
									type="checkbox"
									.checked=${this.currentController?.displaySettings[
										key as keyof typeof RobotController.SettingDescriptions
									] ?? false}
									@change=${(e: Event) => {
										const checked = (e.target as HTMLInputElement).checked;
										this.currentController!.displaySettings[
											key as keyof typeof RobotController.SettingDescriptions
										] = checked;
										this.requestUpdate();
									}}
								/>
								${label}
							</label>`
					  )} `
					: nothing}
			</div>
			${this.mode === "physical" && !this.physicalRobotController
				? this.physicalRoboter.connectionChanging
					? html`<span class="message"
							>The robot is ${this.physicalRoboter.connectionChanging}</span
					  >`
					: html`<span class="message"
							><p>Robot not Connected</p>
							<button
								@click=${async () => {
									const connectFinish = this.physicalRoboter.connect();
									this.requestUpdate();
									await connectFinish;
									this.physicalRobotController = new RobotController(
										this.physicalRoboter
									);
									this.physicalRobotController.manualControl();
									this.requestUpdate();
								}}
							>
								Connect Robot
							</button></span
					  >`
				: html`<canvas
						id="canvas"
						${ref(this.#canvasRef)}
						@wheel=${this.#onWheel}
						@click=${(event: MouseEvent) => {
							if (this.currentController) {
								const canvas = this.#canvasRef.value;
								if (!canvas) return;
								const rect = canvas.getBoundingClientRect();
								const width = canvas.clientWidth * window.devicePixelRatio;
								const height = canvas.clientHeight * window.devicePixelRatio;
								let x = (event.clientX - rect.left) * window.devicePixelRatio;
								if (this.mode === "simulation") {
									x -= width / 2;
								}
								const y = (event.clientY - rect.top) * window.devicePixelRatio;
								const pos = new Vec([x, y]);
								const size =
									this.mode === "simulation"
										? new Vec([width / 2, height])
										: new Vec([width, height]);
								console.log(pos, size, event, rect);
								if (
									pos.x < 0 ||
									pos.x > size.x ||
									pos.y < 0 ||
									pos.y > size.y
								) {
									return;
								}
								this.currentController.userClick(pos, size);
							}
						}}
				  ></canvas>`}
			<div class="buttons">
				<button
					@click=${() => {
						this.currentController?.stop();
						this.mode = this.mode === "simulation" ? "physical" : "simulation";
					}}
				>
					${this.mode === "simulation"
						? "Use Physical Robot"
						: "Switch to Simulation"}
				</button>
				${this.mode === "physical" && this.physicalRobotController
					? html`<button
							@click=${async () => {
								await this.physicalRoboter.disconnect();
								this.physicalRobotController = undefined;
								this.requestUpdate();
							}}
					  >
							Disconnect Robot
					  </button>`
					: nothing}
				${this.currentController
					? html` <button
								@click=${async () => {
									await this.currentController?.stop();
									this.currentController?.reset();
									this.requestUpdate();
								}}
							>
								Reset
							</button>
							<span class="control-strategies"
								><button
									class=${classMap({
										active:
											this.currentController?.currentControlStrategy ===
											undefined,
									})}
									@click=${async () => {
										await this.currentController?.stop();
										this.requestUpdate();
									}}
								>
									Stop
								</button>
								<button
									class=${classMap({
										active:
											this.currentController?.currentControlStrategy ===
											"manual",
									})}
									@click=${async () => {
										await this.currentController?.stop();
										this.currentController?.manualControl();
										this.requestUpdate();
									}}
								>
									Manual Control
								</button>
								<button
									class=${classMap({
										active:
											this.currentController?.currentControlStrategy ===
											"autonomous exploration",
									})}
									@click=${async () => {
										await this.currentController?.stop();
										this.currentController?.autonomousExploration();
										this.requestUpdate();
									}}
								>
									Autonomous Exploration
								</button>
								<button
									class=${classMap({
										active:
											this.currentController?.currentControlStrategy ===
											"guided exploration",
									})}
									@click=${async () => {
										await this.currentController?.stop();
										this.currentController?.guidedExploration();
										this.requestUpdate();
									}}
								>
									Guided Exploration
								</button></span
							>`
					: nothing}
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

		if (this.physicalRobotController && !this.physicalRoboter.isConnected) {
			this.physicalRobotController.stop();
			this.physicalRobotController = undefined;
			this.requestUpdate();
		}

		if (this.mode === "simulation") {
			this.renderSimulation(canvas, ctx, t);
		} else {
			this.renderPhysicalRobot(canvas, ctx, t);
		}
	}

	renderSimulation(
		canvas: HTMLCanvasElement,
		ctx: CanvasRenderingContext2D,
		t: number
	) {
		const { width, height } = canvas;

		this.simulation.camera.scale = 2 ** this.scaleLevel;
		this.simulationRobotController.camera.scale = 2 ** this.scaleLevel;

		ctx.clearRect(0, 0, width, height);

		const splitX = width * 0.5;

		const saved = savedState(ctx);
		saved(() => {
			ctx.beginPath();
			ctx.rect(0, 0, splitX, height);
			ctx.clip();
			this.simulation.render(ctx, new Vec([splitX, height]), t);
		});
		saved(() => {
			ctx.translate(splitX, 0);
			ctx.beginPath();
			ctx.rect(0, 0, width - splitX, height);
			ctx.clip();
			this.simulationRobotController.render(
				ctx,
				new Vec([width - splitX, height]),
				t
			);
		});

		ctx.beginPath();
		ctx.moveTo(splitX, 0);
		ctx.lineTo(splitX, height);
		ctx.strokeStyle = "#fff";
		ctx.lineWidth = 1;
		ctx.stroke();

		const currentRobotPoseEstimate =
			this.simulationRobotController.slam.poseGraph.getNodeEstimate(
				this.simulationRobotController.slam.poseId
			);
		const currentRobotPoseEstimateWithRecentOdometry = RotoTranslation.combine(
			currentRobotPoseEstimate,
			this.simulationRobotController.odometrySinceLastScan.rotoTranslation
		);
		const initialRobotPoseEstimate =
			this.simulationRobotController.slam.poseGraph.getNodeEstimate(0);
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
			ctx.translate(width - 100, height - 100);
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

	renderPhysicalRobot(
		canvas: HTMLCanvasElement,
		ctx: CanvasRenderingContext2D,
		t: number
	) {
		const { width, height } = canvas;

		if (!this.physicalRobotController) {
			ctx.save();
			ctx.font = "24px sans-serif";
			ctx.fillStyle = "#fff";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText("No robot connected", width / 2, height / 2);
			ctx.restore();
			return;
		}

		this.physicalRobotController.camera.scale = 2 ** this.scaleLevel;

		ctx.clearRect(0, 0, width, height);

		const saved = savedState(ctx);
		saved(() => {
			ctx.beginPath();
			ctx.rect(0, 0, width, height);
			ctx.clip();
			this.physicalRobotController?.render(ctx, new Vec([width, height]), t);
		});
	}

	static styles = css`
		#canvas {
			width: 100%;
			height: 100%;
			background-color: #000;
		}

		.message {
			position: absolute;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			color: #fff;
			text-align: center;
		}

		.buttons {
			position: absolute;
			bottom: 0;
			left: 0;
			margin: 0.3em;
		}

		button {
			font: inherit;
			padding: 0.5em 1em;
			margin-right: 0.5em;
			background: #222;
			color: #fff;
			border: none;
			border-radius: 4px;
			cursor: pointer;
			transition: background 0.2s;
		}

		button:hover {
			background: #444;
		}

		.control-strategies {
			display: inline-flex;
			gap: 0.5em;
			margin-top: 0.5em;
			padding: 0.5em;
			background: hsla(0, 0%, 10%);
			border-radius: 0.5em;

			button {
				margin: 0;
				background: #333;
				color: #d8d8d8;
				border-radius: 0.3em;
				padding: 0.4em 0.6em;
				transition: background 0.2s, border-color 0.2s;
			}

			button.active {
				background: #0d5e6d;
				color: #fff;
			}

			button:not(.active):hover {
				background: #444;
				border-color: #666;
			}
		}

		.settings-panel {
			position: absolute;
			top: 0.5em;
			right: 0.5em;
			background: rgba(30, 30, 30, 0.95);
			color: #fff;
			padding: 0.7em 1.2em 0.7em 0.7em;
			border-radius: 0.7em;
			box-shadow: 0 2px 8px #0008;
			z-index: 10;
			display: flex;
			flex-direction: column;
			gap: 0.3em;
			font-size: 1em;
			label {
				display: flex;
				align-items: center;
				gap: 0.5em;
				font-weight: 400;
			}
			input[type="checkbox"] {
				accent-color: #0d5e6d;
				width: 1.1em;
				height: 1.1em;
			}
		}
	`;
}
