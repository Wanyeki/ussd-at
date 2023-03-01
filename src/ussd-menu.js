const EventEmitter = require('events');
const fs = require('fs')
const os = require('os')

function remove98(value) {
    // If the value at the current array index matches the specified value (98)
    if (value !== '98') {
        return value;
    }
}

class USSDMenu extends EventEmitter {
    discardedDir = os.tmpdir() + '/ussd-at/discarded';
    states = {};
    currState = {};
    prevState = {};
    id = '';
    remainingParts = [];
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

        this.id = config.sessionId;
        this.route = config.text == '' || config.text == undefined ? [] : config.text.split('*');
        let route = config.text;
        let parts = route == '' || route == undefined ? [] : route.split('*').filter(remove98)
        if (parts.length == 0) this.session.start();
        parts = this.cleanRoute(parts)
        this.remainingParts = parts;
        this.currState = this.states['__start__']
        let maxRoutes = parts.length;
        let val = parts[0]

        for (let i = 0; i < maxRoutes; i++) {
            this.message = new Promise((res, rej) => {
                this.resolver = res
            });
            let prevVal = val;
            val = parts.shift();
            this.prevState=this.currState; 
            if (this.currState.next) {
                let stateName = this.currState.next[val]
                if (stateName) {
                    this.currState = this.states[stateName];
                    this.val = val
                } else {
                    const maxLength = Object.entries(this.currState.next).length;
                    let nextCount = 0;

                    for (let [key, value] of Object.entries(this.currState.next)) {
                        nextCount++;
                        let reg;
                        if (key.startsWith("*")) {
                            reg = new RegExp(key.slice(1))
                            if (reg.test(val)) {
                                this.currState = this.states[value];
                                this.val = val;
                                break;
                            }
                        } else if (key == '') {
                            this.currState = this.states[val()];
                        } else if (nextCount == maxLength) {
                            this.val = val
                        }
                    }
                }

            } else {
                parts.unshift(val)
                await this.currState.run()
                maxRoutes++

            }
           
            if (this.currState) {
                 // if there are menu.go 
                if (this.prevState.name == this.currState.name && this.val != 98) {
                    parts.unshift(val)
                    await this.currState.run()
                    maxRoutes++
                }
                //if still doesnt change
                if (this.prevState.name == this.currState.name) {
                    maxRoutes--;
                    parts.shift()
                    this.val = prevVal
                    this.discardThis(val)
                    
                }
            }else{
                this.emit('error', 'Did not find a state that matches your input');
                throw new Error(' Did not find a state that matches your input');
            }

        }

        try {
            await this.currState.run()
        } catch (e) {
            this.emit('error', e)
            console.error(e)
            this.end("An Error Occured")
        }

        return await this.message;

    }
    startState = (config) => {
        this.state('__start__', config)
    }

    go = async (name) => {
        if (!this.states[name]) {
            return this.emit('error', new Error('No such state. provided ' + name))
        }
        this.currState = this.states[name]
        if (this.remainingParts.length == 0) {
            await this.currState.run()
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
            if (!fs.existsSync(os.tmpdir() + '/ussd-at')) {
                fs.mkdirSync(os.tmpdir() + '/ussd-at');
                fs.mkdirSync(os.tmpdir() + '/ussd-at/discarded');
            }

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