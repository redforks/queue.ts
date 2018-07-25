import { Action0, Func0 } from 'funts';
export declare enum QueueState {
    beforeStart = 0,
    running = 1,
    stopped = 2
}
export declare type Task = Action0 | Func0<Promise<void>>;
export declare class Queue {
    readonly name: string;
    state: QueueState;
    private waitResolve;
    private tasks;
    private timerId;
    private waiting;
    constructor(name: string);
    put(task: Task, name?: string): void;
    len(): number;
    start(): void;
    loop(): Promise<void>;
    wait(): Promise<void>;
    reset(): Promise<void>;
    _start_loop(): void;
}
