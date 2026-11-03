(function (scope) {
  'use strict';
  const uid = () => globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
  const now = () => new Date().toISOString();
  const day = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const effortFactors = {small:0.5,medium:1,large:2,epic:3};
  const xpFor = (priority,effort='medium') => ({high:40,medium:30,low:20})[priority]*effortFactors[effort];
  const effortMinutes = {small:15,medium:45,large:120,epic:240};
  const roiFor = task => (task.earnedXp||task.status==='done')?0:xpFor(task.priority,task.effort)*60/effortMinutes[task.effort||'medium'];
  function sortTasks(tasks,mode='roi',today=day()){
    const rank={high:0,medium:1,low:2},late=t=>t.status!=='done'&&t.due<today?1:0;
    return tasks.slice().sort((a,b)=>{
      const priority=rank[a.priority]-rank[b.priority],due=a.due.localeCompare(b.due);
      const tie=a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id);
      if(mode==='due')return due||priority||tie;
      if(mode==='priority')return priority||due||tie;
      return priority||late(b)-late(a)||roiFor(b)-roiFor(a)||due||tie;
    });
  }
  const validXp = new Set([0,...['low','medium','high'].flatMap(p=>Object.keys(effortFactors).map(e=>xpFor(p,e)))]);
  function initial() {
    return {version:1,categories:['Work','Design','Deep work','Admin'],tasks:[],rewards:[{id:uid(),name:'Coffee break',cost:50,minutes:10},{id:uid(),name:'Game time',cost:100,minutes:30},{id:uid(),name:'Off-grid reset',cost:30,minutes:15}],ledger:[],sessions:[],timer:null};
  }
  const balance = s => s.ledger.reduce((v,t)=>v+t.amount,0);
  const xp = s => s.tasks.reduce((v,t)=>v+(t.earnedXp||0),0);
  function migrateCategories(s) {
    if(s.categories!==undefined)return s;
    const names=new Map();
    ['Work','Design','Deep work','Admin',...s.tasks.map(t=>t.category)].forEach(name=>{if(!names.has(name.toLowerCase()))names.set(name.toLowerCase(),name);});
    s.categories=[...names.values()];
    s.tasks.forEach(t=>t.category=names.get(t.category.toLowerCase()));
    return s;
  }
  function saveCategory(s,name,previous) {
    migrateCategories(s);
    name=String(name||'').trim();
    if(!name||name.length>40)throw Error('Enter a category name between 1 and 40 characters.');
    if(previous!==undefined&&!s.categories.includes(previous))throw Error('Category no longer exists.');
    if(s.categories.some(c=>c.toLowerCase()===name.toLowerCase()&&c!==previous))throw Error('A category with that name already exists.');
    if(previous===undefined){if(s.categories.length>=200)throw Error('You can have up to 200 categories.');s.categories.push(name);}
    else{
      s.categories=s.categories.map(c=>c===previous?name:c);
      if(name!==previous)s.tasks.filter(t=>t.category===previous).forEach(t=>{t.category=name;t.events.push({type:'category_changed',from:previous,to:name,at:now()});});
    }
    return name;
  }
  function deleteCategory(s,name,replacement) {
    migrateCategories(s);
    if(!s.categories.includes(name))throw Error('Category no longer exists.');
    if(s.categories.length===1)throw Error('Keep at least one category. Add another category first.');
    const tasks=s.tasks.filter(t=>t.category===name);
    if(tasks.length&&(!s.categories.includes(replacement)||replacement===name))throw Error('Choose another category for the existing tasks.');
    tasks.forEach(t=>{t.category=replacement;t.events.push({type:'category_changed',from:name,to:replacement,at:now()});});
    s.categories=s.categories.filter(c=>c!==name);
  }
  function task(s, values, id) {
    const title = String(values.title||'').trim();
    let category = String(values.category||'').trim();
    if (!title || title.length>200 || !category || category.length>40 || !['high','medium','low'].includes(values.priority) || !/^\d{4}-\d{2}-\d{2}$/.test(values.due)) throw Error('Enter a title, category, priority and date.');
    let t = id ? s.tasks.find(t=>t.id===id && !t.deletedAt) : null;
    if (id && !t) throw Error('Task no longer exists.');
    const effort=values.effort??t?.effort??'medium';
    if(!Object.hasOwn(effortFactors,effort))throw Error('Choose a valid effort estimate.');
    migrateCategories(s);
    const existing=s.categories.find(c=>c.toLowerCase()===category.toLowerCase());
    category=existing||saveCategory(s,category);
    if (!t) { t={id:uid(),createdAt:now(),completedAt:null,deletedAt:null,status:'queued',earnedXp:0,events:[]}; s.tasks.push(t); }
    if(id&&t.due!==values.due)t.events.push({type:'rescheduled',fromDue:t.due,toDue:values.due,fromPriority:t.priority,toPriority:values.priority,at:now()});
    else if(id&&t.priority!==values.priority)t.events.push({type:'reprioritized',fromPriority:t.priority,toPriority:values.priority,at:now()});
    Object.assign(t,{title,category,priority:values.priority,effort,due:values.due});
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
        t.earnedXp=xpFor(t.priority,t.effort);
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
  function overdue(s,date=day()) {return s.tasks.filter(t=>!t.deletedAt&&t.status!=='done'&&t.due<date).sort((a,b)=>a.due.localeCompare(b.due));}
  function reschedule(s,id,due,priority,date=day()) {
    const t=s.tasks.find(t=>t.id===id&&!t.deletedAt&&t.status!=='done');
    if(!t)throw Error('Choose an active task.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(due)||due<date)throw Error('Choose today or a future date.');
    return task(s,{...t,due,priority},id);
  }
  function history(s,f) {
    const [start,end]=range(f.date,f.period);
    return s.tasks.filter(t=>{
      const at=f.basis==='completed'?t.completedAt:f.basis==='due'?t.due+'T12:00:00':t.createdAt;
      return at && new Date(at)>=start && new Date(at)<end && (!f.category||f.category===t.category) && (!f.status||(f.status==='deleted'?!!t.deletedAt:!t.deletedAt&&t.status===f.status)) && (t.title+' '+t.category).toLowerCase().includes((f.query||'').toLowerCase());
    }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  }
  function metrics(s,reference,period='day',category='',asOf=new Date()) {
    if(!['day','week'].includes(period))throw Error('Choose daily or weekly metrics.');
    const [start,end]=range(reference,period),cutoff=Math.min(+end,+asOf+1);
    const rows=s.tasks.filter(t=>!category||t.category===category),byId=new Map(s.tasks.map(t=>[t.id,t]));
    const credits=new Map();
    s.ledger.filter(l=>l.type==='task'&&l.taskId).forEach(l=>{if(!credits.has(l.taskId)||+new Date(l.at)<+new Date(credits.get(l.taskId)))credits.set(l.taskId,l.at);});
    const inPeriod=at=>at&&+new Date(at)>=+start&&+new Date(at)<cutoff;
    const changes=t=>t.events.filter(e=>e.type==='rescheduled'&&/^\d{4}-\d{2}-\d{2}$/.test(e.fromDue)&&/^\d{4}-\d{2}-\d{2}$/.test(e.toDue)).slice().sort((a,b)=>+new Date(a.at)-+new Date(b.at));
    // Replay deadline changes. A move made after a deadline cannot turn a late delivery into an on-time one.
    function deadlineAtCompletion(t,at){
      const updates=changes(t);let due=updates[0]?.fromDue||t.due;
      for(const e of updates){if(+new Date(e.at)>+new Date(at))break;if(day(new Date(e.at))>due)break;due=e.toDue;}
      return due;
    }
    function dueAtCutoff(t){let due=t.due;for(const e of changes(t).reverse())if(+new Date(e.at)>=cutoff)due=e.fromDue;return due;}
    function statusAtCutoff(t){
      const events=t.events.filter(e=>['queued','progress','done'].includes(e.type)&&+new Date(e.at)<cutoff).slice().sort((a,b)=>+new Date(a.at)-+new Date(b.at));
      if(events.length)return events.at(-1).type;
      return t.completedAt&&+new Date(t.completedAt)<cutoff?'done':'queued';
    }
    const completions=rows.map(t=>{
      const first=t.events.filter(e=>e.type==='done').slice().sort((a,b)=>+new Date(a.at)-+new Date(b.at))[0]?.at||credits.get(t.id)||t.completedAt;
      return {task:t,at:first,xpAt:credits.get(t.id)||first};
    });
    const finished=completions.filter(c=>inPeriod(c.at));
    const onTime=finished.filter(c=>day(new Date(c.at))<=deadlineAtCompletion(c.task,c.at)).length;
    const earnedXp=completions.filter(c=>inPeriod(c.xpAt)).reduce((sum,c)=>sum+c.task.earnedXp,0);
    const sessions=s.sessions.filter(t=>inPeriod(t.endedAt)&&(!category||byId.get(t.taskId)?.category===category));
    const focusMinutes=sessions.reduce((sum,t)=>sum+t.seconds/60,0);
    const overdueAtCutoff=cutoff<=+start?0:rows.filter(t=>+new Date(t.createdAt)<cutoff&&(!t.deletedAt||+new Date(t.deletedAt)>=cutoff)&&statusAtCutoff(t)!=='done'&&dueAtCutoff(t)<day(new Date(cutoff))).length;
    // Use calendar arithmetic rather than fixed 24-hour intervals across daylight-saving changes.
    const chartStart=new Date(start);if(period==='day')chartStart.setDate(chartStart.getDate()-6);
    const trend=[];
    for(let i=0;i<7;i++){
      const from=new Date(chartStart);from.setDate(from.getDate()+i);const to=new Date(from);to.setDate(to.getDate()+1);
      const activeUntil=Math.min(+to,+asOf+1);
      const done=completions.filter(c=>c.at&&+new Date(c.at)>=+from&&+new Date(c.at)<activeUntil);
      const awarded=completions.filter(c=>c.xpAt&&+new Date(c.xpAt)>=+from&&+new Date(c.xpAt)<activeUntil).reduce((sum,c)=>sum+c.task.earnedXp,0);
      const minutes=s.sessions.filter(t=>+new Date(t.endedAt)>=+from&&+new Date(t.endedAt)<activeUntil&&(!category||byId.get(t.taskId)?.category===category)).reduce((sum,t)=>sum+t.seconds/60,0);
      trend.push({date:day(from),completed:done.length,earnedXp:awarded,focusMinutes:minutes,future:+from>+asOf});
    }
    return {start:day(start),end:day(new Date(+end-1)),partial:+start<=+asOf&&+end>+asOf,future:+start>+asOf,completed:finished.length,onTime,onTimeRate:finished.length?Math.round(onTime/finished.length*100):null,earnedXp,focusMinutes,sessionCount:sessions.length,overdue:overdueAtCutoff,trend};
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
    for(const t of value.tasks)if(!str(t.id,100)||!str(t.title,200)||!str(t.category,40)||!['high','medium','low'].includes(t.priority)||!['queued','progress','done'].includes(t.status)||!str(t.due,10)||!/^\d{4}-\d{2}-\d{2}$/.test(t.due)||!iso(t.createdAt)||(t.completedAt&&!iso(t.completedAt))||(t.deletedAt&&!iso(t.deletedAt))||!validXp.has(t.earnedXp)||!Array.isArray(t.events)||t.events.some(e=>!str(e.type,30)||!iso(e.at)))fail();
    for(const r of value.rewards)if(!str(r.id,100)||!str(r.name,80)||!Number.isInteger(r.cost)||r.cost<1||r.cost>100000||!Number.isInteger(r.minutes)||r.minutes<0||r.minutes>1440)fail();
    for(const l of value.ledger)if(!str(l.id,100)||!str(l.label,200)||!iso(l.at)||!Number.isInteger(l.amount)||Math.abs(l.amount)>100000||!['task','reward'].includes(l.type))fail();
    if(balance(value)<0)fail();
    for(const t of value.sessions)if(!str(t.id,100)||!str(t.taskId,100)||!str(t.title,200)||!Number.isInteger(t.seconds)||t.seconds<60||t.seconds>10800||!iso(t.startedAt)||!iso(t.endedAt))fail();
    if(value.timer){const t=value.timer;if(!str(t.id,100)||!str(t.taskId,100)||!str(t.title,200)||!value.tasks.some(v=>v.id===t.taskId&&!v.deletedAt)||!Number.isInteger(t.seconds)||t.seconds<60||t.seconds>10800||!Number.isInteger(t.remaining)||t.remaining<0||t.remaining>t.seconds||!(t.deadline===null||Number.isFinite(t.deadline))||!iso(t.startedAt))fail();}
    const result=migrateCategories(JSON.parse(JSON.stringify(value)));
    result.tasks.forEach(t=>{if(t.effort===undefined)t.effort='medium';if(!Object.hasOwn(effortFactors,t.effort))fail();});
    if(!Array.isArray(result.categories)||!result.categories.length||result.categories.length>200||result.categories.some(c=>!str(c,40)||!c.trim()||c!==c.trim())||new Set(result.categories.map(c=>c.toLowerCase())).size!==result.categories.length||result.tasks.some(t=>!result.categories.includes(t.category)))fail();
    return result;
  }
  scope.Quest={uid,now,day,xpFor,effortFactors,effortMinutes,roiFor,sortTasks,initial,balance,xp,saveCategory,deleteCategory,task,status,remove,reward,redeem,range,overdue,reschedule,history,metrics,startTimer,remaining,finishTimer,toggleTimer,validate};
})(typeof module!=='undefined'?module.exports:globalThis);
