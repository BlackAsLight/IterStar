type Flat<T> = T extends Iterable<infer U> ? Flat<U> : T
type AsyncFlat<T> = T extends AsyncIterable<infer U> ? AsyncFlat<U> : T
// deno-lint-ignore no-explicit-any
type Force = any

export function* range(from = 0, to?: number): Generator<number> {
	if (to == undefined) {
		to = from
		from = 0
	}
	for (let i = from; i < to; ++i)
		yield i
}

export async function* asyncRange(from = 0, to?: number): AsyncGenerator<number> {
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
		return new Iter((function* (iter) {
			for (const x of iter)
				yield func(x)
		})(this))
	}

	flat(): Iter<Flat<T>> {
		return new Iter((function* (iter) {
			for (const x of iter)
				if ((x as Force)[ Symbol.iterator ])
					for (const y of new Iter(x as Force).flat())
						yield y
				else
					yield x
		})(this)) as Force
	}

	filter<U, V extends unknown = boolean>(func: (x: T) => V): Iter<Extract<T, U>> {
		return new Iter((function* (iter) {
			for (const x of iter)
				if (func(x))
					yield x as Extract<T, U>
		})(this))
	}

	slice(start = 0, end = Infinity): Iter<T> {
		if (start < 0)
			start = 0
		end -= start
		return new Iter((function* (iter) {
			if (end-- > 0)
				for (const x of iter) {
					if (start-- > 0)
						continue
					yield x
					if (end-- <= 0)
						break
				}
		})(this))
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

	join(sep = ''): string {
		let output = ''
		for (const x of this.#gen) {
			output += sep + x
		}
		return output.slice(sep.length)
	}

	[ Symbol.iterator ](): { next: () => IteratorResult<T> } {
		return {
			next: () => this.#gen.next()
		}
	}

	get readable(): ReadableStream<T> {
		return ReadableStream.from(this.#gen)
	}

	toAsync(): AsyncIter<T> {
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
		return new AsyncIter((async function* (asyncIter) {
			for await (const x of asyncIter)
				yield func(x)
		})(this))
	}

	flat(): AsyncIter<AsyncFlat<T>> {
		return new AsyncIter((async function* (asyncIter) {
			for await (const x of asyncIter)
				if ((x as Force)[ Symbol.asyncIterator ])
					for await (const y of new AsyncIter(x as Force).flat())
						yield y
				else
					yield x
		})(this)) as Force
	}

	filter<U, V extends unknown = boolean>(func: (x: T) => V): AsyncIter<Extract<T, U>> {
		return new AsyncIter((async function* (asyncIter) {
			for await (const x of asyncIter)
				if (func(x))
					yield x as Extract<T, U>
		})(this))
	}

	slice(start = 0, end = Infinity): AsyncIter<T> {
		if (start < 0)
			start = 0
		end -= start
		return new AsyncIter((async function* (asyncIter) {
			if (end-- > 0)
				for await (const x of asyncIter) {
					if (start-- > 0)
						continue
					yield x
					if (end-- <= 0)
						break
				}

		})(this))
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

	async join(sep = ''): Promise<string> {
		let output = ''
		for await (const x of this.#gen) {
			output += sep + x
		}
		return output.slice(sep.length)
	}

	[ Symbol.asyncIterator ](): { next: () => Promise<IteratorResult<T>> } {
		return {
			next: () => this.#gen.next()
		}
	}

	get readable(): ReadableStream<T> {
		return ReadableStream.from(this.#gen)
	}
}

export class Queue<T> {
	#head = 0
	#tail = 0
	#list: { [ k: string ]: T } = {}
	constructor (arrayLike?: { [ Symbol.iterator ](): Iterator<T> }) {
		if (arrayLike)
			for (const value of arrayLike)
				this.#list[ this.#tail++ ] = value
	}

	get length(): number {
		return this.#tail - this.#head
	}

	set length(x: number) {
		const len = this.length
		this.#tail = x + this.#head
		if (x < len)
			for (let i = x + this.#head + 1; i < this.#head + len; ++i)
				delete this.#list[ i ]
	}

	shift(): T | undefined {
		if (this.#head < this.#tail) {
			const value = this.#list[ this.#head ]
			delete this.#list[ this.#head++ ]
			return value
		}
	}

	unshift(...array: T[]): number {
		for (const value of array)
			this.#list[ --this.#head ] = value
		return this.length
	}

	pop(): T | undefined {
		if (this.#head < this.#tail) {
			const value = this.#list[ --this.#tail ]
			delete this.#list[ this.#tail ]
			return value
		}
	}

	push(...array: T[]): number {
		for (const value of array)
			this.#list[ this.#tail++ ] = value
		return this.length
	}

	at(i: number): T | undefined {
		return this.#list[ i + this.#head ]
	}

	[ Symbol.iterator ](): { next: () => IteratorResult<T> } {
		return {
			next: () => ({
				done: !this.length,
				value: this.shift()!
			})
		}
	}
}
