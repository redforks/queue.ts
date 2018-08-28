"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lodash_1 = require("lodash");
const rcheck_ts_1 = require("rcheck-ts");
var QueueState;
(function (QueueState) {
    QueueState[QueueState["beforeStart"] = 0] = "beforeStart";
    QueueState[QueueState["running"] = 1] = "running";
    QueueState[QueueState["stopped"] = 2] = "stopped";
})(QueueState = exports.QueueState || (exports.QueueState = {}));
class FatalError extends Error {
    constructor(wrapped) {
        super(wrapped.message);
        this.wrapped = wrapped;
        this.isFatalError = true;
    }
}
exports.FatalError = FatalError;
function isFatalError(x) {
    return lodash_1.isObject(x) && x.isFatalError === true;
}
const maxRetryDelay = 10 * 60 * 1000;
const firstRetryDelay = 1000;
class Queue {
    constructor(name) {
        this.state = QueueState.beforeStart;
        this.waitResolve = null;
        this.tasks = [];
        this.timerId = null;
        this.waiting = null;
        this.delay = 0;
        this.name = name;
        this.state = QueueState.beforeStart;
        this.waitResolve = null;
        this.tasks = [];
        this.loop = this.loop.bind(this);
    }
    put(task, name = '', opt) {
        if (this.state === QueueState.stopped) {
            throw Error(`Queue ${this.name} has stopped`);
        }
        this.tasks.push({
            task,
            name,
            retry: !!opt && opt.retry,
        });
        if (this.state === QueueState.running && this.timerId == null) {
            this._start_loop();
        }
    }
    len() {
        return this.tasks.length;
    }
    start() {
        rcheck_ts_1.assert(this.state === QueueState.beforeStart, `Queue ${this.name} already started`);
        this.state = QueueState.running;
        if (!this.tasks.length) {
            return;
        }
        this._start_loop();
    }
    async loop() {
        this.timerId = null;
        const task = this.tasks.shift();
        if (task) {
            console.log(`[${this.name}] Execute task ${task.name}`);
            let needRetry = false;
            try {
                await task.task();
                this.delay = 0;
            }
            catch (e) {
                console.log(`[${this.name}] Error execute task ${task.name}:\n${e.toString()}`);
                if (task.retry && !isFatalError(e)) {
                    needRetry = true;
                }
            }
            if (needRetry) {
                this.tasks.unshift(task);
                if (this.delay === 0) {
                    this.delay = firstRetryDelay;
                }
                else {
                    this.delay = Math.min(this.delay * 2, maxRetryDelay);
                }
            }
            if (this.tasks.length) {
                this._start_loop();
                return;
            }
        }
        const wr = this.waitResolve;
        if (wr) {
            wr();
        }
    }
    wait() {
        if (this.waiting) {
            return this.waiting;
        }
        if (this.timerId == null) {
            this.state = QueueState.stopped;
            return (this.waiting = Promise.resolve());
        }
        return (this.waiting = new Promise((resolve) => {
            this.waitResolve = () => {
                this.state = QueueState.stopped;
                resolve();
            };
        }));
    }
    async reset() {
        this.tasks = [];
        await this.wait();
        this.state = QueueState.beforeStart;
        this.waiting = null;
        this.timerId = null;
    }
    _start_loop() {
        this.timerId = setTimeout(this.loop, this.delay);
    }
}
exports.Queue = Queue;
