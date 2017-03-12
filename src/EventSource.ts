export type EventHandler<S, T> = (sender: S, data?: T) => void;

export interface IEventSource<S, T> {
	on(handler: EventHandler<S, T>): void;
	off(handler: EventHandler<S, T>): void;
}

export default class EventSource<S, T> implements IEventSource<S, T> {
	private handlers: EventHandler<S, T>[] = [];

	constructor(private sender: S) {}

	public on(handler: EventHandler<S, T>): void {
		this.handlers.push(handler);
	}

	public off(handler: EventHandler<S, T>): void {
		this.handlers = this.handlers.filter(h => h !== handler);
	}

	public trigger(data?: T): void {
		this.handlers.slice(0).forEach(h => h(this.sender, data));
	}

	public expose(): IEventSource<S, T> {
		return this;
	}
}