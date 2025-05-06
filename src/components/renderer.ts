import { LitElement, css, html } from "lit";
import { customElement } from "lit/decorators.js";
import { createRef, ref } from "lit/directives/ref.js";
import { Simulation } from "../logic/simulation";
import { Vec2 } from "../logic/math/vec";
import { savedState } from "../logic/rendering";
import { RobotController } from "../logic/robot-controller";

@customElement("simulation-renderer")
export class SimulationRenderer extends LitElement {
	#canvasRef = createRef<HTMLCanvasElement>();
	#animationFrameId: number | null = null;

	simulation = new Simulation();
	robotController = new RobotController(this.simulation.robot);
	frameCount = 0;
	// #world = World.generate(hashString("hello world"));
	// #camera = {
	// 	position: new Vec2([250, 250]),
	// 	orientation: 0,
	// 	scale: 1,
	// };
	// #robot = new Robot(10, 5);

	constructor() {
		super();
		// this.#robot.driveAng(30, 31);
		setTimeout(() => {
			this.robotController.run();
		}, 500);
	}

	render() {
		return html`<canvas id="canvas" ${ref(this.#canvasRef)}></canvas>`;
	}

	connectedCallback(): void {
		super.connectedCallback();
		if (!this.#animationFrameId) {
			this.#animationFrameId = requestAnimationFrame(() => {
				this.animationRender();
			});
		}
	}

	disconnectedCallback(): void {
		super.disconnectedCallback();
		if (this.#animationFrameId) {
			cancelAnimationFrame(this.#animationFrameId);
			this.#animationFrameId = null;
		}
	}

	animationRender() {
		this.#animationFrameId = requestAnimationFrame(() => {
			this.animationRender();
		});
		const canvas = this.#canvasRef.value;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const { clientWidth, clientHeight } = canvas;
		canvas.width = clientWidth * window.devicePixelRatio;
		canvas.height = clientHeight * window.devicePixelRatio;

		const t = 1 / 60;
		this.simulation.update(t);
		ctx.clearRect(0, 0, clientWidth, clientHeight);

		const splitX = clientWidth * 0.5;

		const saved = savedState(ctx);
		saved(() => {
			ctx.beginPath();
			ctx.rect(0, 0, splitX, clientHeight);
			ctx.clip();
			this.simulation.render(ctx, new Vec2([splitX, clientHeight]), t);
		});
		saved(() => {
			ctx.translate(splitX, 0);
			ctx.beginPath();
			ctx.rect(0, 0, clientWidth - splitX, clientHeight);
			ctx.clip();
			this.robotController.render(
				ctx,
				new Vec2([clientWidth - splitX, clientHeight]),
				t
			);
		});

		ctx.beginPath();
		ctx.moveTo(splitX, 0);
		ctx.lineTo(splitX, clientHeight);
		ctx.strokeStyle = "#fff";
		ctx.lineWidth = 1;
		ctx.stroke();
	}

	static styles = css`
		#canvas {
			width: 100%;
			height: 100%;
			background-color: #000;
		}
	`;
}
