const EventEmitter = require('events');
class USSDMenu extends EventEmitter{
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
        set:null,
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
        this.route=config.text==''||config.text==undefined?[]:config.text.split('*')
        if(config.discardRoutes)this.discardRoutes=true;
        let that=this
        let route=config.text;
        let parts=route==''||route==undefined?[]:route.split('*')
        if(parts.length==0) this.session.start();
        parts=await this.cleanRoute(parts)
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
                        let reg;
                        if(key.startsWith("*")){
                            reg=new RegExp(key.substr(1))
                            if(reg.test(val)){
                                this.curr_state=this.states[value]
                            }
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
        try{
           await this.curr_state.run() 
        }catch(e){
            this.emit('error',e)
            this.end("An Error Occured")
        }
        
        return await this.message;
        
    }
    startState=(config)=>{
        this.state('__start__',config)
    }

    go=(name)=>{
        this.curr_state=this.states[name]
        this.curr_state.run()
    }
    discardThis=()=>{
        if(this.sess.set){
            let rand=Math.round(Math.random()*10000)
            let pos=this.route.length-1;
            let discarded={};
            discarded[rand]={val:this.val,pos}
            this.session.set('discardedRoutes',discarded);
        }else{
            this.emit('error','Can\'t discard whitout a set method');
        }

    }
    discardRoutes=false;
    cleanRoute=async(route)=>{
        if(this.sess.set==null || !this.discardRoutes || route.length==0){return route}
        let discarded=await this.session.get('discardedRoutes');
        if(!discarded){return route}
        let list=[]
        for(let[key,value] of Object.entries(discarded)){
            list.push(value)
        }
        let count=0;
        list=list.sort((a,b)=>a.pos-b.pos)
        for(let i=0;i<list.length;i++){
           let idx=list[i].pos-count;
           if(route[idx]==list[i].val){
               route.splice(idx,1);
           }
           count++; 
        }
        return route

    }

}

module.exports=USSDMenu