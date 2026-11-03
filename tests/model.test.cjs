const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Quest:Q}=require('../dist/model.js');
const add=(s,values={})=>Q.task(s,{title:'Ship the app',category:'Work',priority:'high',due:Q.day(),...values});
test('completing, reopening, deleting and re-completing cannot duplicate earnings',()=>{
  const s=Q.initial(),t=add(s);Q.status(s,t.id,'done');assert.equal(Q.balance(s),10);assert.equal(Q.xp(s),40);
  Q.status(s,t.id,'queued');Q.status(s,t.id,'done');assert.equal(Q.balance(s),10);assert.equal(t.events.filter(e=>e.type==='done').length,2);
  Q.remove(s,t.id);assert.ok(t.deletedAt);assert.equal(Q.xp(s),40);assert.equal(Q.balance(s),10);
});
test('reward redemption checks balance and preserves a snapshot when reward changes',()=>{
  const s=Q.initial();const r=Q.reward(s,{name:'Tea',cost:10,minutes:5});assert.throws(()=>Q.redeem(s,r.id),/more credits/);
  const t=add(s);Q.status(s,t.id,'done');const receipt=Q.redeem(s,r.id);assert.equal(Q.balance(s),0);
  Q.reward(s,{name:'New tea',cost:20,minutes:10},r.id);assert.equal(receipt.label,'Tea');assert.equal(receipt.amount,-10);assert.equal(receipt.minutes,5);
});
test('history uses local calendar day, Monday week, month, category and soft-deleted records',()=>{
  const s=Q.initial();const a=add(s),b=add(s,{category:'Design'});a.completedAt=new Date('2026-11-02T09:00:00').toISOString();b.completedAt=new Date('2026-11-01T09:00:00').toISOString();a.deletedAt=Q.now();
  const f={date:'2026-11-02',period:'week',basis:'completed'};assert.deepEqual(Q.history(s,f).map(t=>t.id),[a.id]);
  assert.equal(Q.history(s,{...f,period:'month'}).length,2);assert.equal(Q.history(s,{...f,period:'month',category:'Design'}).length,1);assert.equal(Q.history(s,{...f,status:'deleted'}).length,1);
  const [start,end]=Q.range('2026-11-01','week');assert.equal(Q.day(start),'2026-10-26');assert.equal(Q.day(end),'2026-11-02');
});
test('timer survives serialization, pauses, and records completion exactly once without clearing task',()=>{
  let s=Q.initial();const t=add(s);Q.startTimer(s,t.id,25);assert.throws(()=>Q.remove(s,t.id),/Reset/);Q.toggleTimer(s);assert.equal(s.timer.deadline,null);assert.ok(s.timer.remaining<=1500);
  s=Q.validate(JSON.parse(JSON.stringify(s)));Q.toggleTimer(s);s.timer.deadline=Date.now()-1;assert.equal(Q.finishTimer(s),true);assert.equal(Q.finishTimer(s),false);assert.equal(s.sessions.length,1);assert.equal(s.tasks[0].status,'queued');assert.equal(Q.balance(s),0);
});
test('backup round trip retains full history and rejects invalid or unsupported data',()=>{
  const s=Q.initial(),t=add(s);Q.status(s,t.id,'done');assert.deepEqual(Q.validate(s),s);
  assert.throws(()=>Q.validate({...s,version:2}),/backup/);assert.throws(()=>Q.validate({...s,tasks:[{title:'bad'}]}),/backup/);
  assert.throws(()=>Q.validate({...s,tasks:[t,t]}),/backup/);assert.throws(()=>Q.reward(s,{name:'Bad',cost:-1}),/whole credit/);
});
test('empty categories persist and duplicate names are rejected without changing state',()=>{
  const s=Q.initial();Q.saveCategory(s,'Engineering');
  assert.ok(Q.validate(JSON.parse(JSON.stringify(s))).categories.includes('Engineering'));
  assert.throws(()=>Q.saveCategory(s,' engineering '),/already exists/);
  Q.deleteCategory(s,'Engineering');assert.ok(!Q.validate(s).categories.includes('Engineering'));
  Q.deleteCategory(s,'Admin');assert.ok(!Q.validate(s).categories.includes('Admin'));
});
test('renaming and deleting reassign all task history without changing rewards or dates',()=>{
  const s=Q.initial(),active=add(s),completed=add(s);Q.status(s,completed.id,'done');Q.remove(s,completed.id);
  const completion=completed.completedAt,earned=Q.xp(s),credits=Q.balance(s);
  Q.saveCategory(s,'Engineering','Work');assert.equal(active.category,'Engineering');assert.equal(completed.category,'Engineering');
  assert.throws(()=>Q.deleteCategory(s,'Engineering'),/Choose another/);
  Q.deleteCategory(s,'Engineering','Design');assert.equal(active.category,'Design');assert.equal(completed.category,'Design');
  assert.equal(completed.completedAt,completion);assert.equal(Q.xp(s),earned);assert.equal(Q.balance(s),credits);
  assert.equal(completed.events.at(-1).from,'Engineering');assert.equal(completed.events.at(-1).to,'Design');
  assert.ok(!Q.validate(s).categories.includes('Engineering'));
});
test('legacy backups gain their existing categories, and the final category cannot be deleted',()=>{
  const s=Q.initial();add(s,{category:'Custom work'});delete s.categories;
  const migrated=Q.validate(s);assert.ok(migrated.categories.includes('Custom work'));assert.equal(migrated.tasks[0].category,'Custom work');
  const empty=Q.initial();empty.categories=['Only category'];assert.throws(()=>Q.deleteCategory(empty,'Only category'),/at least one/);
  assert.throws(()=>Q.validate({...empty,categories:['Work','work']}),/backup/);
  assert.throws(()=>Q.validate({...migrated,categories:['Missing task category']}),/backup/);
});
test('XP combines priority with estimated effort for all twelve combinations',()=>{
  for(const priority of ['low','medium','high'])for(const effort of ['small','medium','large','epic']){
    const s=Q.initial(),t=add(s,{priority,effort});Q.status(s,t.id,'done');
    const expected=({low:20,medium:30,high:40})[priority]*({small:.5,medium:1,large:2,epic:3})[effort];
    assert.equal(t.earnedXp,expected);assert.equal(Q.balance(s),10);assert.deepEqual(Q.validate(s),s);
  }
  assert.ok(Q.xpFor('low','large')>Q.xpFor('high','small'));
});
test('old tasks default to medium effort without recalculating earned rewards',()=>{
  const s=Q.initial(),t=add(s);Q.status(s,t.id,'done');delete t.effort;
  const migrated=Q.validate(s);assert.equal(migrated.tasks[0].effort,'medium');assert.equal(migrated.tasks[0].earnedXp,40);assert.equal(Q.balance(migrated),10);
  Q.status(migrated,t.id,'queued');Q.task(migrated,{title:t.title,category:t.category,priority:'high',effort:'epic',due:t.due},t.id);Q.status(migrated,t.id,'done');
  assert.equal(migrated.tasks[0].earnedXp,40);assert.equal(Q.balance(migrated),10);
  assert.throws(()=>add(Q.initial(),{effort:'invalid'}),/effort estimate/);
  assert.throws(()=>Q.validate({...migrated,tasks:[{...migrated.tasks[0],effort:'invalid'}]}),/backup/);
});
test('overdue review excludes completed and deleted tasks and reschedules without losing history',()=>{
  const s=Q.initial(),old=add(s,{due:'2026-11-01',effort:'large'}),done=add(s,{due:'2026-11-01'}),deleted=add(s,{due:'2026-11-01'});
  Q.status(s,done.id,'done');Q.remove(s,deleted.id);
  assert.deepEqual(Q.overdue(s,'2026-11-03').map(t=>t.id),[old.id]);
  assert.throws(()=>Q.reschedule(s,old.id,'2026-11-02','low','2026-11-03'),/today or a future/);
  Q.reschedule(s,old.id,'2026-11-04','medium','2026-11-03');
  assert.equal(old.effort,'large');assert.equal(Q.xpFor(old.priority,old.effort),60);assert.equal(old.due,'2026-11-04');assert.equal(old.createdAt,s.tasks[0].createdAt);
  assert.equal(Q.overdue(s,'2026-11-03').length,0);
  const log=old.events.find(e=>e.type==='rescheduled');assert.equal(log.fromDue,'2026-11-01');assert.equal(log.toDue,'2026-11-04');assert.equal(log.fromPriority,'high');assert.equal(log.toPriority,'medium');
  assert.equal(Q.balance(s),10);assert.equal(old.earnedXp,0);assert.deepEqual(Q.validate(s),s);
});
const iso=(date,time='09:00:00')=>new Date(date+'T'+time).toISOString();
function metricTask(s,{title='Report task',due='2026-11-02',category='Work',created='2026-11-01',finished=null,earned=40}={}){
  const t=add(s,{title,due,category});t.createdAt=iso(created);t.events=[{type:'created',at:t.createdAt}];
  if(finished){t.status='done';t.completedAt=iso(finished,'10:00:00');t.earnedXp=earned;t.events.push({type:'done',at:t.completedAt});s.ledger.push({id:Q.uid(),type:'task',taskId:t.id,label:t.title,at:t.completedAt,amount:10});}
  return t;
}
test('daily and weekly metrics use first completions, actual XP and completed focus sessions',()=>{
  const s=Q.initial();const a=metricTask(s,{finished:'2026-11-02',earned:20});
  a.events.push({type:'queued',at:iso('2026-11-03')},{type:'done',at:iso('2026-11-03','10:00:00')});a.completedAt=iso('2026-11-03','10:00:00');
  const b=metricTask(s,{due:'2026-11-03',finished:'2026-11-03',earned:60});
  b.events.splice(1,0,{type:'rescheduled',at:iso('2026-11-02'),fromDue:'2026-11-01',toDue:'2026-11-03'});
  metricTask(s,{due:'2026-11-02'});metricTask(s,{due:'2026-11-01',finished:'2026-11-01'});
  metricTask(s,{due:'2026-11-03',finished:'2026-11-03',category:'Design',earned:30});
  s.sessions=[{id:'focus1',taskId:a.id,title:a.title,seconds:1500,startedAt:iso('2026-11-02'),endedAt:iso('2026-11-02','09:25:00')},{id:'focus2',taskId:b.id,title:b.title,seconds:3000,startedAt:iso('2026-11-03'),endedAt:iso('2026-11-03','09:50:00')}];
  const m=Q.metrics(s,'2026-11-03','week','Work',new Date('2026-11-03T12:00:00'));
  assert.equal(m.completed,2);assert.equal(m.onTime,1);assert.equal(m.onTimeRate,50);assert.equal(m.earnedXp,80);assert.equal(m.focusMinutes,75);assert.equal(m.overdue,1);assert.equal(m.partial,true);
  const daily=Q.metrics(s,'2026-11-03','day','Work',new Date('2026-11-03T12:00:00'));
  assert.equal(daily.completed,1);assert.equal(daily.earnedXp,60);assert.equal(daily.onTimeRate,0);assert.equal(daily.focusMinutes,50);
  assert.equal(m.trend.reduce((sum,v)=>sum+v.completed,0),2);assert.equal(m.trend[0].date,'2026-11-02');assert.equal(m.trend[6].date,'2026-11-08');
  assert.equal(m.trend.reduce((sum,v)=>sum+v.earnedXp,0),m.earnedXp);assert.equal(m.trend.reduce((sum,v)=>sum+v.focusMinutes,0),m.focusMinutes);
  assert.equal(m.trend[0].earnedXp,20);assert.equal(m.trend[1].earnedXp,60);assert.equal(m.trend[0].focusMinutes,25);assert.equal(m.trend[1].focusMinutes,50);
});
test('historical carryover reconstructs the due date, deletion and status at the cutoff',()=>{
  const s=Q.initial(),t=metricTask(s,{due:'2026-11-10',finished:'2026-11-04'});
  t.deletedAt=iso('2026-11-06');
  t.events.push({type:'rescheduled',at:iso('2026-11-05'),fromDue:'2026-11-02',toDue:'2026-11-10'},{type:'deleted',at:t.deletedAt});
  const past=Q.metrics(s,'2026-11-02','day','',new Date('2026-11-10T12:00:00'));
  assert.equal(past.overdue,1);assert.equal(past.completed,0);
  const after=Q.metrics(s,'2026-11-06','day','',new Date('2026-11-10T12:00:00'));assert.equal(after.overdue,0);
  const finished=Q.metrics(s,'2026-11-04','day','',new Date('2026-11-10T12:00:00'));assert.equal(finished.completed,1);assert.equal(finished.earnedXp,40);
});
test('timely replanning remains on time, while future and empty periods have no invented rates',()=>{
  const s=Q.initial(),t=metricTask(s,{due:'2026-11-03',finished:'2026-11-03',created:'2026-10-30'});
  t.events.splice(1,0,{type:'rescheduled',at:iso('2026-10-31'),fromDue:'2026-11-01',toDue:'2026-11-03'});
  const m=Q.metrics(s,'2026-11-03','day','',new Date('2026-11-03T10:00:00'));assert.equal(m.completed,1);assert.equal(m.onTimeRate,100);
  const future=Q.metrics(s,'2026-11-10','day','',new Date('2026-11-03T12:00:00'));assert.equal(future.future,true);assert.equal(future.onTimeRate,null);assert.equal(future.earnedXp,0);assert.equal(future.overdue,0);
  const empty=Q.metrics(s,'2026-11-03','day','Missing',new Date('2026-11-03T12:00:00'));assert.equal(empty.completed,0);assert.equal(empty.onTimeRate,null);assert.equal(empty.focusMinutes,0);
  assert.ok(empty.trend.every(v=>v.earnedXp===0&&v.focusMinutes===0&&v.completed===0));
});
