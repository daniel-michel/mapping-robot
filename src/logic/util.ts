export const once = (() => {
	const cache = new Set();
	return (callback: () => void) => {
		const key = callback.toString();
		if (cache.has(key)) {
			return;
		}
		cache.add(key);
		callback();
	};
})();

export const sleep = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));
