(function (scope) {
  'use strict';
  const uid = () => globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
  const now = () => new Date().toISOString();
  const day = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const xpFor = p => ({high:40,medium:30,low:20})[p];
  function initial() {
    return {version:1,tasks:[],rewards:[{id:uid(),name:'Coffee break',cost:50,minutes:10},{id:uid(),name:'Game time',cost:100,minutes:30},{id:uid(),name:'Off-grid reset',cost:30,minutes:15}],ledger:[],sessions:[],timer:null};
  }
  const balance = s => s.ledger.reduce((v,t)=>v+t.amount,0);
  const xp = s => s.tasks.reduce((v,t)=>v+(t.earnedXp||0),0);
  function task(s, values, id) {
    const title = String(values.title||'').trim();
    const category = String(values.category||'').trim();
    if (!title || title.length>200 || !category || category.length>40 || !['high','medium','low'].includes(values.priority) || !/^\d{4}-\d{2}-\d{2}$/.test(values.due)) throw Error('Enter a title, category, priority and date.');
    let t = id ? s.tasks.find(t=>t.id===id && !t.deletedAt) : null;
    if (id && !t) throw Error('Task no longer exists.');
    if (!t) { t={id:uid(),createdAt:now(),completedAt:null,deletedAt:null,status:'queued',earnedXp:0,events:[]}; s.tasks.push(t); }
    Object.assign(t,{title,category,priority:values.priority,due:values.due});
    t.events.push({type:id?'edited':'created',at:now()});
    return t;
  }
  function status(s,id,value) {
    const t=s.tasks.find(t=>t.id===id && !t.deletedAt);
    if (!t || !['queued','progress','done'].includes(value)) throw Error('Invalid task status.');
    if (value===t.status) return;
    t.status=value;
    t.events.push({type:value,at:now()});
    if(value==='done') {
      t.completedAt=now();
      if (!t.earnedXp) {
        t.earnedXp=xpFor(t.priority);
        s.ledger.push({id:uid(),at:now(),amount:10,type:'task',taskId:t.id,label:t.title});
      }
    }
  }
  function remove(s,id) {
    const t=s.tasks.find(t=>t.id===id);
    if(!t || t.deletedAt) return;
    if(s.timer?.taskId===id) throw Error('Reset the focus timer before deleting its task.');
    t.deletedAt=now(); t.events.push({type:'deleted',at:t.deletedAt});
  }
  function reward(s,values,id) {
    const name=String(values.name||'').trim(), cost=Number(values.cost), minutes=Number(values.minutes||0);
    if(!name || name.length>80 || !Number.isInteger(cost) || cost<1 || cost>100000 || !Number.isInteger(minutes) || minutes<0 || minutes>1440) throw Error('Enter a reward name, whole credit cost and valid duration.');
    let r=id?s.rewards.find(r=>r.id===id):null;
    if(id&&!r) throw Error('Reward no longer exists.');
    if(!r){r={id:uid()};s.rewards.push(r);}
    Object.assign(r,{name,cost,minutes});return r;
  }
  function redeem(s,id) {
    const r=s.rewards.find(r=>r.id===id);
    if(!r) throw Error('Reward no longer exists.');
    if(balance(s)<r.cost) throw Error(`Earn ${r.cost-balance(s)} more credits to redeem this reward.`);
    const receipt={id:uid(),at:now(),amount:-r.cost,type:'reward',rewardId:r.id,label:r.name,minutes:r.minutes};
    s.ledger.push(receipt);return receipt;
  }
  function range(reference,period) {
    const start=new Date(reference+'T00:00:00');
    if(Number.isNaN(+start)) throw Error('Choose a valid date.');
    if(period==='week') start.setDate(start.getDate()-(start.getDay()+6)%7);
    if(period==='month') start.setDate(1);
    const end=new Date(start);
    if(period==='month') end.setMonth(end.getMonth()+1);else end.setDate(end.getDate()+(period==='week'?7:1));
    return [start,end];
  }
  function history(s,f) {
    const [start,end]=range(f.date,f.period);
    return s.tasks.filter(t=>{
      const at=f.basis==='completed'?t.completedAt:f.basis==='due'?t.due+'T12:00:00':t.createdAt;
      return at && new Date(at)>=start && new Date(at)<end && (!f.category||f.category===t.category) && (!f.status||(f.status==='deleted'?!!t.deletedAt:!t.deletedAt&&t.status===f.status)) && (t.title+' '+t.category).toLowerCase().includes((f.query||'').toLowerCase());
    }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  }
  function startTimer(s,taskId,minutes) {
    if(s.timer) throw Error('Reset the current session first.');
    const t=s.tasks.find(t=>t.id===taskId&&!t.deletedAt&&t.status!=='done');
    if(!t||!Number.isInteger(minutes)||minutes<1||minutes>180) throw Error('Choose an active task and 1–180 whole minutes.');
    s.timer={id:uid(),taskId,title:t.title,seconds:minutes*60,remaining:minutes*60,deadline:Date.now()+minutes*60000,startedAt:now()};
  }
  function remaining(s) {return s.timer?Math.max(0,s.timer.deadline?Math.ceil((s.timer.deadline-Date.now())/1000):s.timer.remaining):0;}
  function finishTimer(s) {
    if(!s.timer||!s.timer.deadline||remaining(s)>0)return false;
    if(!s.sessions.some(t=>t.id===s.timer.id))s.sessions.push({id:s.timer.id,taskId:s.timer.taskId,title:s.timer.title,seconds:s.timer.seconds,startedAt:s.timer.startedAt,endedAt:now()});
    s.timer=null;return true;
  }
  function toggleTimer(s) {
    if(!s.timer)return;
    if(finishTimer(s))return;
    if(s.timer.deadline){s.timer.remaining=remaining(s);s.timer.deadline=null;}else{s.timer.deadline=Date.now()+s.timer.remaining*1000;}
  }
  function validate(value) {
    const fail=()=>{throw Error('This file is not a valid QUEST//OS v1 backup.');};
    if(!value||value.version!==1||!['tasks','rewards','ledger','sessions'].every(k=>Array.isArray(value[k])&&value[k].length<=50000))fail();
    const str=(v,max)=>typeof v==='string'&&v.length<=max;
    const iso=v=>str(v,40)&&Number.isFinite(Date.parse(v));
    for(const k of ['tasks','rewards','ledger','sessions'])if(new Set(value[k].map(v=>v.id)).size!==value[k].length)fail();
    for(const t of value.tasks)if(!str(t.id,100)||!str(t.title,200)||!str(t.category,40)||!['high','medium','low'].includes(t.priority)||!['queued','progress','done'].includes(t.status)||!str(t.due,10)||!/^\d{4}-\d{2}-\d{2}$/.test(t.due)||!iso(t.createdAt)||(t.completedAt&&!iso(t.completedAt))||(t.deletedAt&&!iso(t.deletedAt))||![0,20,30,40].includes(t.earnedXp)||!Array.isArray(t.events)||t.events.some(e=>!str(e.type,30)||!iso(e.at)))fail();
    for(const r of value.rewards)if(!str(r.id,100)||!str(r.name,80)||!Number.isInteger(r.cost)||r.cost<1||r.cost>100000||!Number.isInteger(r.minutes)||r.minutes<0||r.minutes>1440)fail();
    for(const l of value.ledger)if(!str(l.id,100)||!str(l.label,200)||!iso(l.at)||!Number.isInteger(l.amount)||Math.abs(l.amount)>100000||!['task','reward'].includes(l.type))fail();
    if(balance(value)<0)fail();
    for(const t of value.sessions)if(!str(t.id,100)||!str(t.taskId,100)||!str(t.title,200)||!Number.isInteger(t.seconds)||t.seconds<60||t.seconds>10800||!iso(t.startedAt)||!iso(t.endedAt))fail();
    if(value.timer){const t=value.timer;if(!str(t.id,100)||!str(t.taskId,100)||!str(t.title,200)||!value.tasks.some(v=>v.id===t.taskId&&!v.deletedAt)||!Number.isInteger(t.seconds)||t.seconds<60||t.seconds>10800||!Number.isInteger(t.remaining)||t.remaining<0||t.remaining>t.seconds||!(t.deadline===null||Number.isFinite(t.deadline))||!iso(t.startedAt))fail();}
    return JSON.parse(JSON.stringify(value));
  }
  scope.Quest={uid,now,day,xpFor,initial,balance,xp,task,status,remove,reward,redeem,range,history,startTimer,remaining,finishTimer,toggleTimer,validate};
})(typeof module!=='undefined'?module.exports:globalThis);
