import { DEG_TO_RAD } from "../math/util.ts";
import { Vec } from "../math/vec.ts";
import { sleep } from "../util.ts";
import {
	RangingSensorConfig,
	RangingSensorScan,
	Robot,
	RobotWheelConfig,
} from "./robot.ts";

export class ArduinoRobot implements Robot {
	port?: SerialPort;
	#connectionChanging?: string;
	#abortListen?: AbortController;

	wheelConfig: RobotWheelConfig = {
		radius: 1.5,
		stepFraction: 1 / 2048,
		trackWidth: 9.5,
	};

	rangingSensor: RangingSensorConfig = {
		rotationAngle: 135 * DEG_TO_RAD,
		/** this is the targeted step size the actual step size may vary to fully utilize the rotationAngle */
		targetAngleStepSize: 2 * DEG_TO_RAD,
		distanceRange: [2, 780],
		distanceAccuracy: 4,
		angularAccuracy: 3.5 * DEG_TO_RAD,
		refreshTime: 1 / 50,
	};

	constructor() {}

	get #rangingSensorSteps() {
		const stepCount = Math.round(
			this.rangingSensor.rotationAngle / this.rangingSensor.targetAngleStepSize
		);
		const angleStep = this.rangingSensor.rotationAngle / (stepCount - 1);
		return { size: angleStep, count: stepCount };
	}

	get isConnected() {
		return this.port !== undefined;
	}
	get connectionChanging() {
		return this.#connectionChanging;
	}

	async driveSteps(left: number, right: number) {
		if (
			!Number.isInteger(left) ||
			!Number.isInteger(right) ||
			Math.abs(left) > 2 ** 15 - 1 ||
			Math.abs(right) > 2 ** 15 - 1
		) {
			throw new RangeError(
				`The number of steps for the left and right wheel must be an integer in where -(2 ** 15 - 1) <= (left|right) <= 2 ** 15 - 1`
			);
		}
		const command = new Uint8Array(6);
		const int16View = new Int16Array(command.buffer);
		command[0] = 1;
		int16View[1] = left;
		int16View[2] = right;
		const iter = this.#runCommand(command);
		let current = await iter.next();
		while (!current.done) {
			const { value } = current;
			const [left, right] = value.split(",").map((v) => +v);

			current = await iter.next();
		}
	}
	async scan(): Promise<RangingSensorScan> {
		const { count: numberOfMeasurements, size: stepAngle } =
			this.#rangingSensorSteps;
		const result: RangingSensorScan = {
			angle: this.rangingSensor.rotationAngle,
			angleStep: stepAngle,
			count: numberOfMeasurements,
			distanceRange: this.rangingSensor.distanceRange,
			points: [],
		};
		// command id: 5
		const iter = this.#runCommand(new Uint8Array([5, numberOfMeasurements]));
		for await (const value of iter) {
			// const { value } = current;
			/** 0: invalid, 1: valid */
			const [index, valid, distanceMM] = value.split(",").map((v) => +v);
			// distance in cm
			const distance = distanceMM / 10;

			const angle = index * stepAngle - this.rangingSensor.rotationAngle * 0.5;
			result.points.push(
				valid
					? {
							angle,
							distance,
							point: new Vec([0, 1]).rotate2d(angle).mul(distance),
					  }
					: {
							angle,
							distance: 0,
							point: null,
					  }
			);
		}
		return result;
	}

	async connect() {
		if (this.#connectionChanging) {
			throw new Error(
				`Connection is already changing to: ${this.#connectionChanging}`
			);
		}
		if (!("serial" in navigator)) {
			throw new Error("Serial API is not supported in this browser");
		}
		if (!this.isConnected) {
			try {
				this.#connectionChanging = "connecting";
				this.port = await navigator.serial.requestPort({
					filters: [
						{
							usbVendorId: 0x403,
							usbProductId: 0x6001,
						},
					],
				});
				await this.port.open({ baudRate: 9600 });
				this.#listen();
				await sleep(5_000); // wait for the Arduino to initialize
				console.log("Connected to Arduino Robot");
			} finally {
				this.#connectionChanging = undefined;
			}
		}
	}

	async disconnect() {
		if (this.#connectionChanging) {
			throw new Error(
				`Connection is already changing to: ${this.#connectionChanging}`
			);
		}
		if (this.port) {
			try {
				this.#connectionChanging = "disconnecting";
				if (this.#abortListen) {
					this.#abortListen.abort();
					this.#abortListen = undefined;
					await sleep(100); // wait for the abort to take effect
				}
				await this.port.close();
				this.port = undefined;
				console.log("Disconnected from Arduino Robot");
			} finally {
				this.#connectionChanging = undefined;
			}
		}
	}

	async *#runCommand(command: Uint8Array, timeout: number = 60_000) {
		const id = Math.floor(Math.random() * 2 ** 16);
		const commandWithId = new Uint8Array(command.length + 2);
		commandWithId.set(command, 2);
		console.log("setting command id", id);
		new Uint16Array(commandWithId.buffer)[0] = id;

		const response = this.#listenFor(id);
		const timeoutPromise = sleep(timeout);
		try {
			let nextValue = response.next();
			await this.#sendData(commandWithId);
			while (true) {
				const res = await Promise.race([nextValue, timeoutPromise]);
				if (!res) {
					throw new Error("Command timed out");
				}
				if (res.done) {
					break;
				}
				yield res.value;
				nextValue = response.next();
			}
		} finally {
			await response.return();
		}
	}

	#lastSendPromise?: Promise<void>;
	async #sendData(data: Uint8Array) {
		if (data.byteLength > 255) {
			throw new RangeError(
				"The amount of data to be sent is greater than 255, 255 is the maximum"
			);
		}
		if (!this.isConnected) {
			throw new Error("Cannot send data: not connected to Arduino Robot");
		}
		console.log(
			"sending data",
			Array.from(data)
				.map((d) => d.toString(16))
				.join(" ")
		);
		const thisPromise = Promise.withResolvers<void>();
		const previousPromise = this.#lastSendPromise;
		try {
			this.#lastSendPromise = thisPromise.promise;
			await previousPromise;
			if (!this.port?.writable) {
				throw new Error("Cannot send data: port is not writable");
			}
			const writer = this.port.writable.getWriter();
			try {
				// write Null CR LF, to indicate new data:
				await writer.write(new Uint8Array([0, 13, 10]));
				// write size of data
				await writer.write(new Uint8Array([data.byteLength]));
				// write the actual data
				await writer.write(data);
			} finally {
				writer.releaseLock();
			}
		} finally {
			thisPromise.resolve();
		}
	}

	#listeners: Set<{
		id: number;
		data: ReturnType<typeof createControlledIterator<string>>;
	}> = new Set();
	async *#listenFor(id: number) {
		let obj:
			| {
					id: number;
					data: ReturnType<typeof createControlledIterator<string>>;
			  }
			| undefined = {
			id,
			data: createControlledIterator(),
		};
		this.#listeners.add(obj);
		try {
			for await (const result of obj.data.iterator) {
				yield result;
			}
		} finally {
			if (obj) {
				this.#listeners.delete(obj);
			}
		}
	}

	async #listen() {
		if (!this.isConnected) {
			throw new Error("Robot is not connected");
		}
		if (!this.port?.readable) {
			console.error("Port is not readable");
			return;
		}
		const decoder = new TextDecoder();
		let buffer = "";
		while (this.port.readable) {
			const reader = this.port.readable.getReader();
			this.#abortListen = new AbortController();
			this.#abortListen.signal.addEventListener("abort", () => {
				reader.releaseLock();
			});
			try {
				while (true) {
					const { value, done } = await reader.read();
					if (done) {
						break;
					}
					buffer += decoder.decode(value, { stream: true });
					let lines = buffer.split("\n");
					buffer = lines.pop() || ""; // Keep the last partial line in buffer
					for (const line of lines) {
						if (line.trim()) {
							if (line.startsWith("log ")) {
								const message = line.slice(4).trim();
								console.log("Arduino Log:", message);
							} else if (line.startsWith("err ")) {
								const message = line.slice(6).trim();
								console.error("Arduino Error:", message);
							} else if (line.startsWith("data ")) {
								console.log("Arduino data", line);
								const [idStr, ...rest] = line.slice(5).trim().split(":");
								const id = +idStr;
								const listener = this.#listeners
									.values()
									.find((v) => v.id === id);
								if (listener) {
									if (rest.at(-1) === "$") {
										listener.data.close();
									} else {
										listener.data.add(rest.join(":"));
									}
								}
							} else {
								console.warn("Arduino unknown:", line);
							}
						}
					}
				}
			} catch (error) {
				this.#abortListen.signal.throwIfAborted();
				console.error("Error reading from serial port:", error);
			} finally {
				this.#abortListen = undefined;
				reader.releaseLock();
			}
		}
		this.disconnect();
	}
}

type NextPromType<T> = PromiseWithResolvers<NextPromContent<T>>;
type NextPromContent<T> =
	| {
			done?: false;
			value: T;
			next: NextPromType<T>;
	  }
	| {
			done: true;
	  };
function createControlledIterator<T>(): {
	iterator: AsyncGenerator<T, void, void>;
	add: (value: T) => void;
	close: () => void;
} {
	let lastValue: NextPromType<T> = Promise.withResolvers();
	let currentNext: NextPromType<T> = lastValue;

	return {
		add(value) {
			const next: NextPromType<T> = Promise.withResolvers<NextPromContent<T>>();
			lastValue.resolve({ value, next });
			lastValue = next;
		},
		close() {
			lastValue.resolve({ done: true });
		},
		iterator: (async function* iterator() {
			while (true) {
				const current = await currentNext.promise;
				if (current.done) {
					break;
				}
				yield current.value;
				currentNext = current.next;
			}
		})(),
	};
}
