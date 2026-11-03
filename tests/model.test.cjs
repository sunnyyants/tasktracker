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
