export function* range(from = 0, to?: number) {
	if (to == undefined)
		to = from
	for (let i = from; i < to; ++i)
		yield i
}

export async function* asyncRange(from = 0, to?: number) {
	if (to == undefined)
		to = from
	for (let i = from; i < to; ++i)
		yield i
}

export class Iter<T> {
	#gen: { [ Symbol.iterator ](): Iterator<T> }
	constructor (array: { [ Symbol.iterator ](): Iterator<T> }) {
		this.#gen = array
	}

	collect(): T[] {
		const output = []
		for (const x of this.#gen)
			output.push(x)
		return output
	}

	wait(): void {
		// deno-lint-ignore no-empty
		for (const _x of this.#gen) { }
	}

	shift(): T | undefined {
		for (const x of this.#gen)
			return x
	}

	forEach<U>(func: (x: T) => U): void {
		for (const x of this.#gen)
			func(x)
	}

	map<U>(func: (x: T) => U): Iter<U> {
		return new Iter((function* (gen) {
			for (const x of gen)
				yield func(x)
		})(this.#gen))
	}

	filter<U>(func: (x: T) => U): Iter<T> {
		return new Iter((function* (gen) {
			for (const x of gen)
				if (func(x))
					yield x
		})(this.#gen))
	}

	slice(start = 0, end = Infinity): Iter<T> {
		if (start < 0)
			start = 0
		end -= start
		return new Iter((function* (gen) {
			if (end-- > 0)
				for (const x of gen) {
					if (start-- > 0)
						continue
					yield x
					if (end-- <= 0)
						break
				}
		})(this.#gen))
	}

	reduce(func: (x: T, y: T) => T): T
	reduce<U>(func: (x: U, y: T) => U, init: U): U
	reduce<U>(func: (x: T | U, y: T) => U, init?: T | U): T | U {
		if (init == undefined) {
			init = this.shift()
			if (init == undefined)
				throw Error('Uncaught TypeError: reduce of empty iter with no initial value')
		}
		for (const x of this.#gen) {
			init = func(init, x)
		}
		return init
	}

	join(sep = '') {
		let output = ''
		for (const x of this.#gen) {
			output += sep + x
		}
		return output.slice(sep.length)
	}
}

export class AsyncIter<T> {
	#gen: { [ Symbol.asyncIterator ](): AsyncIterator<T> }
	constructor (array: { [ Symbol.asyncIterator ](): AsyncIterator<T> }) {
		this.#gen = array
	}

	async collect(): Promise<T[]> {
		const output = []
		for await (const x of this.#gen)
			output.push(x)
		return output
	}

	async wait(): Promise<void> {
		// deno-lint-ignore no-empty
		for await (const _x of this.#gen) { }
	}

	async shift(): Promise<T | undefined> {
		for await (const x of this.#gen)
			return x
	}

	async forEach<U>(func: (x: T) => U): Promise<void> {
		for await (const x of this.#gen)
			func(x)
	}

	map<U>(func: (x: T) => U): AsyncIter<U> {
		return new AsyncIter((async function* (gen) {
			for await (const x of gen)
				yield func(x)
		})(this.#gen))
	}

	filter<U>(func: (x: T) => U): AsyncIter<T> {
		return new AsyncIter((async function* (gen) {
			for await (const x of gen)
				if (func(x))
					yield x
		})(this.#gen))
	}

	slice(start = 0, end = Infinity): AsyncIter<T> {
		if (start < 0)
			start = 0
		end -= start
		return new AsyncIter((async function* (gen) {
			if (end-- > 0)
				for await (const x of gen) {
					if (start-- > 0)
						continue
					yield x
					if (end-- <= 0)
						break
				}

		})(this.#gen))
	}

	async reduce(func: (x: T, y: T) => T): Promise<T>
	async reduce<U>(func: (x: U, y: T) => U, init: U): Promise<U>
	async reduce<U>(func: (x: T | U, y: T) => U, init?: T | U): Promise<T | U> {
		if (init == undefined) {
			init = await this.shift()
			if (init == undefined)
				throw Error('Uncaught TypeError: reduce of empty iter with no initial value')
		}
		for await (const x of this.#gen) {
			init = await func(init, x)
		}
		return init
	}

	async join(sep = '') {
		let output = ''
		for await (const x of this.#gen) {
			output += sep + x
		}
		return output.slice(sep.length)
	}
}
