import { LitElement, css, html } from "lit";
import { customElement } from "lit/decorators.js";
import "./components/renderer";

@customElement("app-root")
export class AppRoot extends LitElement {
	render() {
		return html`<simulation-renderer></simulation-renderer>`;
	}

	static styles = css`
		:host {
			display: block;
			width: 100%;
			height: 100%;
			background-color: #000;
		}
	`;
}
