type Flat<T> = T extends Iterable<infer U> ? (U extends object ? Flat<U> : U) : T
type AsyncFlat<T> = T extends AsyncIterable<infer U> ? (U extends object ? AsyncFlat<U> : U) : T

/**
 * A simply number generator that will generate numbers from `from` up to but excluding `to`.
 * If to is omitted then `to` becomes `from` and `from` becomes `0`.
 */
export function* range(from: number, to?: number): Generator<number> {
	if (to == undefined) {
		to = from
		from = 0
	}
	for (let i = from; i < to; ++i) yield i
}

/**
 * This function consumes an iterable passing the values to the `func` where a max of `threads` amount of `func`s are being
 * processed concurrently.
 */
export async function parallel<T, U>(
	threads: number,
	iterable: Iterable<T> | AsyncIterable<T>,
	func: (x: T) => Promise<U>,
): Promise<U[]> {
	const iter = Symbol.iterator in iterable ? iterable[Symbol.iterator]() : iterable[Symbol.asyncIterator]()
	const promises: Promise<number>[] = []
	const output: U[] = []

	x: {
		let next: IteratorResult<T>
		for (let i = 0; i < threads; ++i) {
			next = await iter.next()
			if (next.done) break x
			promises.push(wrap(next.value, i, i))
		}
		let j = promises.length
		while (true) {
			const i = await Promise.race(promises)
			next = await iter.next()
			if (next.done) break
			promises[i] = wrap(next.value, j++, i)
		}
	}
	await Promise.all(promises)

	return output
	async function wrap(value: T, outputIndex: number, promiseIndex: number) {
		output[outputIndex] = await func(value)
		return promiseIndex
	}
}

/**
 * This class takes in an iterable and offers many array like methods to consume said iterable. Methods that return Iter or
 * AsyncIter don't actually pull the values through on their own. You'll need to call a method like `.forEach`, `.wait`, or
 * `.shift` for a value to actually be pulled through and applied to the different methods.
 */
export class Iter<T> {
	#gen: Generator<T>
	constructor(iterable: Iterable<T>) {
		this.#gen = (function* () {
			for (const x of iterable) yield x
		})()
	}

	/**
	 * Pulls all the values in the iterable through and returns them in an array.
	 */
	collect(): T[] {
		const output = []
		for (const x of this.#gen) output.push(x)
		return output
	}

	/**
	 * Pulls all the values in the iterable until its empty.
	 */
	wait(): void {
		// deno-lint-ignore no-empty
		while (!this.#gen.next().done) {}
	}

	/**
	 * Pulls the next value in the iterable through and returns it, else returns `undefined `if empty.
	 */
	shift(): T | undefined {
		return this.#gen.next().value
	}

	/**
	 * Pulls all the values in the iterable through passing them to the `func`.
	 */
	forEach<U>(func: (x: T) => U): void {
		for (const x of this.#gen) func(x)
	}

	/**
	 * This method is just like `Iter.parallelOrder`, but doesn't maintain the output order of the pulled in values.
	 */
	parallelRace<U>(threads: number, func: (x: T) => Promise<U>): AsyncIter<U> {
		return new AsyncIter<U>(
			(async function* (gen) {
				const promises: Promise<{ i: number; x: U }>[] = []
				x: {
					let next: IteratorResult<T>
					for (let i = 0; i < threads; ++i) {
						next = gen.next()
						if (next.done) break x
						promises.push(func(next.value).then(x => ({ i, x })))
					}
					while (true) {
						const { i, x } = await Promise.race(promises)
						yield x
						next = gen.next()
						if (next.done) {
							promises.splice(i, 1)
							break
						}
						promises[i] = func(next.value).then(x => ({ i, x }))
					}
				}

				let resolve: (() => void) | undefined
				const yields: U[] = []
				const len = promises.length
				while (promises.length)
					promises.pop()!.then(({ x }) => {
						yields.push(x)
						if (resolve) {
							resolve()
							resolve = undefined
						}
					})
				for (let i = 0; i < len; ++i) {
					while (!yields.length) await new Promise<void>(a => (resolve = a))
					yield yields.pop()!
				}
			})(this.#gen),
		)
	}

	/**
	 * This method is like the `AsyncIter.map` method, but processes at max `threads` concurrently, meaning if this step is
	 * quite time consuming in a non-event blocking type of way then you can reduce the overall time by starting the next
	 * `threads - 1` sooner.
	 */
	parallelOrder<U>(threads: number, func: (x: T) => Promise<U>): AsyncIter<U> {
		return new AsyncIter<U>(
			(async function* (gen) {
				let key = 0
				const map: Map<number, Promise<U>> = new Map()
				const iter = map.entries()

				for (let i = 0; i < threads; ++i) {
					const next = gen.next()
					if (next.done) break
					map.set(key++, func(next.value))
				}
				while (true) {
					yield (iter.next().value as [number, Promise<U>])[1]
					const next = gen.next()
					if (next.done) break
					map.set(key++, func(next.value))
				}
				for (const x of iter) yield x[1]
			})(this.#gen),
		)
	}

	/**
	 * Passes the iterable values through the `func` and changing them to what `func` returns. Mutates the values in the
	 * iterable as they pass through.
	 */
	map<U>(func: (x: T) => U): Iter<U> {
		return new Iter<U>({
			[Symbol.iterator]: () => ({
				next: () => {
					const next = this.#gen.next()
					if (next.done) return { done: true, value: undefined }
					return { done: false, value: func(next.value) }
				},
			}),
		})
	}

	/**
	 * Flattens the values as they pass through the iterable.
	 */
	flat(): Iter<Flat<T>> {
		const iters: Iterator<T>[] = [this.#gen]
		return new Iter<Flat<T>>({
			[Symbol.iterator]: () => ({
				next: () => {
					while (iters.length) {
						const iter = iters.pop()!
						const next = iter.next()
						if (next.done) continue
						iters.push(iter)
						if (next.value && typeof next.value === 'object' && Symbol.iterator in next.value)
							iters.push((next.value as Iterable<T>)[Symbol.iterator]())
						else return { done: false, value: next.value as Flat<T> }
					}
					return { done: true, value: undefined }
				},
			}),
		})
	}

	/**
	 * Filters out desired values as they pass through the iterable.
	 */
	filter<U extends T>(func: ((x: T) => x is U) | ((x: T) => unknown)): Iter<Extract<T, U>> {
		return new Iter<Extract<T, U>>({
			[Symbol.iterator]: () => ({
				next: () => {
					while (true) {
						const next = this.#gen.next()
						if (next.done) return { done: true, value: undefined }
						if (func(next.value)) return { done: false, value: next.value as Extract<T, U> }
					}
				},
			}),
		})
	}

	/**
	 * Voids the first `start` values as they pass through, returning the next `end - start` values.
	 */
	slice(start = 0, end = Infinity): Iter<T> {
		if (start < 0) start = 0
		end -= start
		return new Iter(
			(function* (gen) {
				if (end > 0) {
					while (start-- > 0) if (gen.next().done) return
					while (end-- > 0) {
						const next = gen.next()
						if (next.done) return
						yield next.value
					}
				}
			})(this.#gen),
		)
	}

	/**
	 * Pulls all the values in the iterable through passing them to `func` to reduce to a single value.
	 */
	reduce(func: (x: T, y: T) => T): T
	reduce<U>(func: (x: U, y: T) => U, init: U): U
	reduce<U>(func: (x: T | U, y: T) => U, init?: T | U): T | U {
		if (init == undefined) {
			init = this.shift()
			if (init == undefined) throw Error('Uncaught TypeError: reduce of empty iter with no initial value')
		}
		for (const x of this.#gen) init = func(init, x)
		return init
	}

	/**
	 * Pulls all the values in the iterable through joining them into a string with `sep` in between.
	 */
	join(sep = ''): string {
		let output = '' + ((this.#gen.next().value as T | undefined) ?? '')
		for (const x of this.#gen) output += sep + x
		return output
	}

	/**
	 * Converts the Iter class into an AsyncIter.
	 */
	toAsync(): AsyncIter<T> {
		return new AsyncIter(this)
	}

	/**
	 * Provides a ReadableStream property of the iterable.
	 */
	get readable(): ReadableStream<T> {
		return new ReadableStream({
			pull: controller => {
				const next = this.#gen.next()
				if (next.done) controller.close()
				else controller.enqueue(next.value)
			},
		})
	}

	/**
	 * Makes the iterable be passed to anything that accepts an Iterator
	 */
	[Symbol.iterator](): Iterator<T> {
		return {
			next: () => this.#gen.next(),
		}
	}
}

/**
 * This class takes in an iterable and offers many array like methods to consume said iterable. Methods that return AsyncIter
 * don't actually pull the values through on their own. You'll need to call a method like `.forEach`, `.wait`, or `.shift` for a
 * value to actually be pulled through and applied to the different methods.
 */
export class AsyncIter<T> {
	#gen: AsyncGenerator<T>
	constructor(iterable: Iterable<T> | AsyncIterable<T>) {
		this.#gen = (async function* () {
			for await (const x of iterable) yield x
		})()
	}

	/**
	 * Pulls all the values in the iterable through and returns them in an array.
	 */
	async collect(): Promise<T[]> {
		const output = []
		for await (const x of this.#gen) output.push(x)
		return output
	}

	/**
	 * Pulls all the values in the iterable until its empty.
	 */
	async wait(): Promise<void> {
		// deno-lint-ignore no-empty
		while (!(await this.#gen.next()).done) {}
	}

	/**
	 * Pulls the next value in the iterable through and returns it, else returns `undefined` if empty.
	 */
	async shift(): Promise<T | undefined> {
		return (await this.#gen.next()).value
	}

	/**
	 * Pulls all the values in the iterable through passing them to the `func`.
	 */
	async forEach<U>(func: (x: T) => U): Promise<void> {
		for await (const x of this.#gen) await func(x)
	}

	/**
	 * This method is just like the `AsyncIter.parallelOrder`, but doesn't maintain the output order of the pulled in values.
	 */
	parallelRace<U>(threads: number, func: (x: T) => Promise<U>): AsyncIter<U> {
		return new AsyncIter<U>(
			(async function* (gen) {
				const promises: Promise<{ i: number; x: U }>[] = []
				x: {
					let next: IteratorResult<T>
					for (let i = 0; i < threads; ++i) {
						next = await gen.next()
						if (next.done) break x
						promises.push(func(next.value).then(x => ({ i, x })))
					}
					while (true) {
						const { i, x } = await Promise.race(promises)
						yield x
						next = await gen.next()
						if (next.done) {
							promises.splice(i, 1)
							break
						}
						promises[i] = func(next.value).then(x => ({ i, x }))
					}
				}

				let resolve: (() => void) | undefined
				const yields: U[] = []
				const len = promises.length
				while (promises.length)
					promises.pop()!.then(({ x }) => {
						yields.push(x)
						if (resolve) {
							resolve()
							resolve = undefined
						}
					})
				for (let i = 0; i < len; ++i) {
					while (!yields.length) await new Promise<void>(a => (resolve = a))
					yields.pop()!
				}
			})(this.#gen),
		)
	}

	/**
	 * This method is like the `AsyncIter.map` method, but processes at max `threads` concurrently, meaning if this step is
	 * quite time consuming in a non-event blocking type of way then you can reduce the overall time by starting the next
	 * `threads - 1` sooner.
	 */
	parallelOrder<U>(threads: number, func: (x: T) => Promise<U>): AsyncIter<U> {
		return new AsyncIter<U>(
			(async function* (gen) {
				let key = 0
				const map: Map<number, Promise<U>> = new Map()
				const iter = map.entries()

				for (let i = 0; i < threads; ++i) {
					const next = await gen.next()
					if (next.done) break
					map.set(key++, func(next.value))
				}
				while (true) {
					yield (iter.next().value as [number, Promise<U>])[1]
					const next = await gen.next()
					if (next.done) break
					map.set(key++, func(next.value))
				}
				for (const x of iter) yield x[1]
			})(this.#gen),
		)
	}

	/**
	 * Passes the iterable values through the `func` and changing them to what `func` returns. Mutating the values in the
	 * iterable as they pass through
	 */
	map<U>(func: (x: T) => U): AsyncIter<U> {
		return new AsyncIter<U>({
			[Symbol.asyncIterator]: () => ({
				next: async () => {
					const next = await this.#gen.next()
					if (next.done) return { done: true, value: undefined }
					return { done: false, value: await func(next.value) }
				},
			}),
		})
	}

	/**
	 * Flattens the values as they pass through the iterable.
	 */
	flat(): AsyncIter<AsyncFlat<T>> {
		const iters: AsyncIterator<T>[] = [this.#gen]
		return new AsyncIter<AsyncFlat<T>>({
			[Symbol.asyncIterator]: () => ({
				next: async () => {
					while (iters.length) {
						const iter = iters.pop()!
						const next = await iter.next()
						if (next.done) continue
						iters.push(iter)
						if (next.value && typeof next.value === 'object' && Symbol.asyncIterator in next.value)
							iters.push((next.value as AsyncIterable<T>)[Symbol.asyncIterator]())
						else return { done: false, value: next.value as AsyncFlat<T> }
					}
					return { done: true, value: undefined }
				},
			}),
		})
	}

	/**
	 * Filters out desired values as they pass through the iterable.
	 */
	filter<U extends T>(func: ((x: T) => x is U) | ((x: T) => unknown)): AsyncIter<Extract<T, U>> {
		return new AsyncIter<Extract<T, U>>({
			[Symbol.asyncIterator]: () => ({
				next: async () => {
					while (true) {
						const next = await this.#gen.next()
						if (next.done) return { done: true, value: undefined }
						if (await func(next.value)) return { done: false, value: next.value as Extract<T, U> }
					}
				},
			}),
		})
	}

	/**
	 * Voids the first `start` values as they pass through, returning the next `end - start` values.
	 */
	slice(start = 0, end = Infinity): AsyncIter<T> {
		if (start < 0) start = 0
		end -= start
		return new AsyncIter(
			(async function* (gen) {
				if (end > 0) {
					while (start-- > 0) if ((await gen.next()).done) return
					while (end-- > 0) {
						const next = await gen.next()
						if (next.done) return
						yield next.value
					}
				}
			})(this.#gen),
		)
	}

	/**
	 * Pulls all the values in the iterable through passing them to `func` to reduce to a single value.
	 */
	async reduce(func: (x: T, y: T) => T): Promise<T>
	async reduce<U>(func: (x: U, y: T) => U, init: U): Promise<U>
	async reduce<U>(func: (x: T | U, y: T) => U, init?: T | U): Promise<T | U> {
		if (init == undefined) {
			init = await this.shift()
			if (init == undefined) throw Error('Uncaught TypeError: reduce of empty iter with no initial value')
		}
		for await (const x of this.#gen) init = await func(init, x)
		return init
	}

	/**
	 * Pulls all the values in the iterable through joining them into a string with `sep` in between.
	 */
	async join(sep = ''): Promise<string> {
		let output = '' + (((await this.#gen.next()).value as T | undefined) ?? '')
		for await (const x of this.#gen) output += sep + x
		return output.slice(sep.length)
	}

	/**
	 * Provides a ReadableStream property of the iterable.
	 */
	get readable(): ReadableStream<T> {
		return new ReadableStream({
			pull: async controller => {
				const next = await this.#gen.next()
				if (next.done) controller.close()
				else controller.enqueue(next.value)
			},
		})
	}

	/**
	 * Makes the iterable be passed to anything that accepts an AsyncIterator.
	 */
	[Symbol.asyncIterator](): AsyncIterator<T> {
		return {
			next: () => this.#gen.next(),
		}
	}
}

export class Queue<T> {
	#head = 0
	#tail = 0
	#list: { [k: string]: T } = {}
	constructor(iterable?: Iterable<T>) {
		if (iterable) for (const x of iterable) this.#list[this.#tail++] = x
	}

	get length(): number {
		return this.#tail - this.#head
	}

	set length(x: number) {
		const len = this.length
		this.#tail = x + this.#head
		if (x < len) for (let i = x + this.#head + 1; i < this.#head + len; ++i) delete this.#list[i]
	}

	shift(): T | undefined {
		if (this.#head < this.#tail) {
			const x = this.#list[this.#head]
			delete this.#list[this.#head++]
			return x
		}
	}

	unshift(...array: T[]): number {
		for (const value of array) this.#list[--this.#head] = value
		return this.length
	}

	pop(): T | undefined {
		if (this.#head < this.#tail) {
			const x = this.#list[--this.#tail]
			delete this.#list[this.#tail]
			return x
		}
	}

	push(...array: T[]): number {
		for (const x of array) this.#list[this.#tail++] = x
		return this.length
	}

	at(i: number): T | undefined {
		return this.#list[i + this.#head]
	}

	[Symbol.iterator](): Iterator<T> {
		return {
			next: () => ({
				done: !this.length,
				value: this.shift()!,
			}),
		}
	}
}
