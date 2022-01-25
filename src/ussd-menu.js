const EventEmitter = require('events');
const fs = require('fs')
const os = require('os')

class USSDMenu extends EventEmitter {
    discardedDir = os.tmpdir() + '/ussd-at/discarded';
    states = {};
    curr_state = {};
    id = '';
    remaining_parts = [];
    session = {
        set: (...args) => this.sess['set'](this.id, ...args),
        get: (...args) => this.sess['get'](this.id, ...args),
        end: (...args) => this.sess['end'](this.id, ...args),
        start: (...args) => this.sess['start'](this.id, ...args)
    }
    sess = {
        set: (id) => { },
        get: (id) => { },
        end: (id) => { },
        start: (id) => { }
    }
    resolver = (x) => { }

    message = new Promise((res, rej) => {
        this.resolver = res
    })

    sessionConfig = (config) => {
        this.sess.set = config.set ? config.set : () => { }
        this.sess.get = config.get ? config.get : () => { }
        this.sess.end = config.end ? config.end : () => { }
        this.sess.start = config.start ? config.start : () => { }
    }

    state = (name, options) => {
        options.name = name
        this.states[name] = options
    }
    con = (text) => {
        this.resolver('CON ' + text)
    }
    end = (text) => {
        this.session.end()
        this.resolver('END ' + text)
    }
    run = async (config) => {
        this.id = config.sessionId
        this.route = config.text == '' || config.text == undefined ? [] : config.text.split('*')
        let that = this
        let route = config.text;
        let parts = route == '' || route == undefined ? [] : route.split('*')
        if (parts.length == 0) this.session.start();
        parts = this.cleanRoute(parts)
        this.remaining_parts = parts;
        this.curr_state = this.states['__start__']
        let max_routes = parts.length;
        let val = parts[0]

        for (let i = 0; i < max_routes; i++) {
            this.message = new Promise((res, rej) => {
                that.resolver = res
            });
            let prev_val = val;
            val = parts.shift();

            if (this.curr_state.next) {
                let state_name = this.curr_state.next[val]
                if (state_name) {
                    this.curr_state = this.states[state_name];
                    this.val = val
                } else {
                    const max_length = Object.entries(this.curr_state.next).length;
                    let curr_next = 0;

                    for (let [key, value] of Object.entries(this.curr_state.next)) {
                        curr_next++;
                        let reg;
                        if (key.startsWith("*")) {
                            reg = new RegExp(key.slice(1))
                            if (reg.test(val)) {
                                this.curr_state = this.states[value];
                                this.val = val;
                                break;
                            } else {
                                // this.errorOccured=true;
                                if (curr_next == max_length) {
                                    this.val = prev_val
                                    this.discardThis(val)
                                }
                            }
                        } else if (curr_next == max_length) {
                            this.val = val
                        }

                    }
                }

            } else {
                parts.unshift(val)
                await this.curr_state.run()
                max_routes++

            }
        }

        try {
            await this.curr_state.run()
        } catch (e) {
            this.emit('error', e)
            this.end("An Error Occured")
        }

        return await this.message;

    }
    startState = (config) => {
        this.state('__start__', config)
    }
    goStart = async () => {
        await this.go('__start__')
    }
    go = async (name) => {
        this.curr_state = this.states[name]
        if (this.remaining_parts.length == 0) {
            await this.curr_state.run()
        }
    }
    discardThis = (val = null) => {
        let pos = this.route.length - 1;
        const discarded = { val: val || this.val, pos }
        this.saveDiscardedRoutes(discarded)
    }
    cleanRoute = (route) => {
        if (route.length == 0) { return route }
        let discarded = this.getDiscardedRoutes()
        if (discarded.length == 0) { return route }

        let count = 0;
        discarded = discarded.sort((a, b) => a.pos - b.pos)
        for (let i = 0; i < discarded.length; i++) {
            let idx = discarded[i].pos - count;
            if (route[idx] == discarded[i].val) {
                route.splice(idx, 1);
            }
            count++;
        }
        return route

    }

    saveDiscardedRoutes = (data) => {
        if (fs.existsSync(this.discardedDir + '/' + this.id)) {
            const discarded = JSON.parse(fs.readFileSync(this.discardedDir + '/' + this.id));
            discarded.routes.push(data);
            fs.writeFileSync(this.discardedDir + '/' + this.id, JSON.stringify(discarded));

        } else {
            fs.mkdirSync(os.tmpdir() + '/ussd-at');
            fs.mkdirSync(os.tmpdir() + '/ussd-at/discarded');
            fs.writeFileSync(this.discardedDir + '/' + this.id, JSON.stringify({ routes: [data] }))
        }
    }
    getDiscardedRoutes = () => {
        if (fs.existsSync(this.discardedDir + '/' + this.id)) {
            const discarded = JSON.parse(fs.readFileSync(this.discardedDir + '/' + this.id));
            return discarded.routes;
        } else {
            return []
        }
    }

}

module.exports = USSDMenu