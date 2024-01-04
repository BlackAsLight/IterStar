type Flat<T> = T extends Iterable<infer U> ? Flat<U> : T
type AsyncFlat<T> = T extends AsyncIterable<infer U> ? AsyncFlat<U> : T
// deno-lint-ignore no-explicit-any
type Force = any

export function* range(from = 0, to?: number) {
	if (to == undefined) {
		to = from
		from = 0
	}
	for (let i = from; i < to; ++i)
		yield i
}

export async function* asyncRange(from = 0, to?: number) {
	if (to == undefined) {
		to = from
		from = 0
	}
	for (let i = from; i < to; ++i)
		yield i
}

export class Iter<T> {
	#gen: Generator<T>
	constructor (array: { [ Symbol.iterator ](): Iterator<T> }) {
		this.#gen = (function* () {
			for (const x of array)
				yield x
		})()
	}

	collect(): T[] {
		const output = []
		for (const x of this.#gen)
			output.push(x)
		return output
	}

	wait(): void {
		// deno-lint-ignore no-empty
		while (!this.#gen.next().done) { }
	}

	shift(): T | undefined {
		return this.#gen.next().value
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

	flat(): Iter<Flat<T>> {
		return new Iter((function* a(gen) {
			for (const x of gen)
				if ((x as Force)[ Symbol.iterator ])
					for (const y of new Iter(x as Force).flat())
						yield y
				else
					yield x
		})(this.#gen)) as Force
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

	[ Symbol.iterator ]() {
		return {
			next: () => this.#gen.next()
		}
	}

	toAsync() {
		return new AsyncIter((async function* (gen) {
			for (const x of gen)
				yield x
		})(this.#gen))
	}
}

export class AsyncIter<T> {
	#gen: AsyncGenerator<T>
	constructor (array: { [ Symbol.asyncIterator ](): AsyncIterator<T> }) {
		this.#gen = (async function* () {
			for await (const x of array)
				yield x
		})()
	}

	async collect(): Promise<T[]> {
		const output = []
		for await (const x of this.#gen)
			output.push(x)
		return output
	}

	async wait(): Promise<void> {
		// deno-lint-ignore no-empty
		while (!(await this.#gen.next()).done) { }
	}

	async shift(): Promise<T | undefined> {
		return (await this.#gen.next()).value
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

	flat(): AsyncIter<AsyncFlat<T>> {
		return new AsyncIter((async function* (gen) {
			for await (const x of gen)
				if ((x as Force)[ Symbol.asyncIterator ])
					for await (const y of new AsyncIter(x as Force).flat())
						yield y
				else
					yield x
		})(this.#gen)) as Force
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

	[ Symbol.asyncIterator ]() {
		return {
			next: () => this.#gen.next()
		}
	}
}
