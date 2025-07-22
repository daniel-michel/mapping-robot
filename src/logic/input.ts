export function getInput() {
	const inputs = [getGamepadInput(), getKeyboardInput()];
	let biggestAmount = 0;
	let biggestInput = { longitudinal: 0, lateral: 0 };
	for (const input of inputs) {
		const amount = input.longitudinal ** 2 + input.lateral ** 2;
		if (amount > biggestAmount) {
			biggestAmount = amount;
			biggestInput = input;
		}
	}
	return biggestInput;
}

export function getGamepadInput(): {
	longitudinal: number;
	lateral: number;
} {
	const gamepads = navigator.getGamepads();
	const gamepad = gamepads.find((pad) => pad !== null);
	if (!gamepad) {
		return { longitudinal: 0, lateral: 0 };
	}
	const leftStickX = gamepad.axes[0];
	const rightTrigger = gamepad.buttons[7].value;
	const leftTrigger = gamepad.buttons[6].value;
	const longitudinal = rightTrigger - leftTrigger;
	const lateral =
		Math.sign(leftStickX) * Math.max(0, Math.abs(leftStickX) - 0.1);
	return { longitudinal, lateral };
}

export const getKeyboardInput = (() => {
	const keysPressed = {
		w: false,
		s: false,
		a: false,
		d: false,
	};
	window.addEventListener("keydown", (e) => {
		const key = e.key;
		if (key in keysPressed) {
			keysPressed[key as keyof typeof keysPressed] = true;
		}
	});
	window.addEventListener("keyup", (e) => {
		const key = e.key;
		if (key in keysPressed) {
			keysPressed[key as keyof typeof keysPressed] = false;
		}
	});
	return function (): {
		longitudinal: number;
		lateral: number;
	} {
		return {
			longitudinal: +keysPressed.w - +keysPressed.s,
			lateral: +keysPressed.d - +keysPressed.a,
		};
	};
})();
