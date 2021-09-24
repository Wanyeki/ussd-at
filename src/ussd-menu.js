
class USSDMenu{
    states={}
    curr_state={}
    id=''
    session={
        set:(...args)=>this.sess['set'](this.id,...args),
        get:(...args)=>this.sess['get'](this.id,...args),
        end:(...args)=>this.sess['end'](this.id,...args),
        start:(...args)=>this.sess['start'](this.id,...args)
    }
    sess={
        set:(id)=>{},
        get:(id)=>{},
        end:(id)=>{},
        start:(id)=>{}
    }
    resolver=(x)=>{}

    message=new Promise((res,rej)=>{
        this.resolver=res
    })

    sessionConfig=(config)=>{
        this.sess.set=config.set?config.set:()=>{}
        this.sess.get=config.get?config.get:()=>{}
        this.sess.end=config.end?config.end:()=>{}
        this.sess.start=config.start?config.start:()=>{}
    }

    state=(name,options)=>{
        options.name=name
        this.states[name]=options
    }
    con=(text)=>{
        this.resolver('CON '+text)
    }
    end=(text)=>{
        this.session.end()
        this.resolver('END '+text)
    }
    run=async (config)=>{
        this.id=config.sessionId
        let that=this
        let route=config.text;
        let parts=route===''?[]:route.split('*')
        if(parts.length==0) this.session.start();

        this.curr_state=this.states['__start__']
        let max_routes=parts.length; 
        let val=parts[0]

        for(let i=0;i<max_routes;i++){
            this.message=new Promise((res,rej)=>{
                that.resolver=res
            });
            val=parts.shift()

            if(this.curr_state.next){
                let state_name=this.curr_state.next[val]
                if(state_name){
                    this.curr_state=this.states[state_name]
                }else{
                    for(let [key,value] of Object.entries(this.curr_state.next)){
                        if(key.startsWith("*\\") && val.match(new RegExp(key.substr(1)))>0){
                            this.curr_state=this.states[value]
                        }
                    }
                }
            }else{
                max_routes++
                parts.unshift(val)
                await  this.curr_state.run()
            }
        }

        this.val=val
        await this.curr_state.run()
        return await this.message;
        
    }
    startState=(config)=>{
        this.state('__start__',config)
    }

    go=(name)=>{
        this.curr_state=this.states[name]
        this.curr_state.run()
    }


}

module.exports=USSDMenu