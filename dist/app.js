/* QUEST//OS: vanilla browser UI; no network requests or third-party dependencies. */
(()=>{
  'use strict';
  const Q=globalThis.Quest, KEY='quest-os-v1', VIEW='quest-os-view-v1';
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=name=>`<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const stamp=v=>v?new Date(v).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'—';
  let state, raw, storageBlocked=false, toastTimeout, selectedMinutes=25, currentPage='missions', historyPage=0, confirmAction;
  let prefs={layout:'board',group:'status',compact:false,collapsed:{},timerFolded:false};
  try{raw=localStorage.getItem(KEY);state=raw?Q.validate(JSON.parse(raw)):Q.initial();}catch(e){state=Q.initial();storageBlocked=true;$('#storage-error').hidden=false;$('#storage-error').textContent='Saved data could not be read. Changes are blocked to protect it. Export available data or try this browser’s normal mode.';}
  try{const p=JSON.parse(localStorage.getItem(VIEW)||'null');if(p&&['board','list'].includes(p.layout)&&['status','category','priority'].includes(p.group))prefs={...prefs,...p};}catch{}
  let storedRaw=raw||null;
  function notify(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('#toast').hidden=true,5000);}
  function preferences(){try{localStorage.setItem(VIEW,JSON.stringify(prefs));}catch{} }
  function change(fn,message){
    if(storageBlocked){notify('Storage is unavailable. Export a backup before making changes.');return false;}
    const before=JSON.stringify(state);
    try{
      if(localStorage.getItem(KEY)!==storedRaw)throw Error('Another tab changed your data. Reload this tab before continuing.');
      fn();const next=JSON.stringify(state);localStorage.setItem(KEY,next);storedRaw=next;
      render();if(message)notify(message);return true;
    }catch(e){state=JSON.parse(before);notify(e.message||'Could not save. Export a backup and check browser storage.');return false;}
  }
  function confirmation(title,text,fn){$('#confirm-title').textContent=title;$('#confirm-text').textContent=text;confirmAction=fn;$('#confirm-dialog').showModal();}
  $('#confirm-yes').onclick=()=>{const action=confirmAction;$('#confirm-dialog').close();confirmAction=null;action?.();};
  $$('[data-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.close).close());
  function categories(){return [...new Set(state.tasks.map(t=>t.category).concat(['Work','Design','Deep work','Admin']))].sort((a,b)=>a.localeCompare(b));}
  function selectCategories(id){const el=$(id),value=el.value;el.innerHTML='<option value="">All categories</option>'+categories().map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');el.value=categories().includes(value)?value:'';}
  function render(){
    const xp=Q.xp(state),level=Math.floor(xp/200)+1;
    $('#balance').textContent=Q.balance(state);$('#level').textContent=String(level).padStart(2,'0');$('#xp-label').textContent=`LEVEL ${level} · ${xp%200} / 200 XP`;$('#xp').value=xp%200;
    $('#today-label').textContent=new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'}).toUpperCase();
    selectCategories('#task-category');selectCategories('#history-category');$('#categories').innerHTML=categories().map(c=>`<option value="${esc(c)}">`).join('');
    renderRewards();renderTasks();renderHistory();renderTimer();
    $('#data-stats').textContent=`${state.tasks.length} tasks · ${state.rewards.length} rewards · ${state.sessions.length} focus sessions · ${state.ledger.length} credit transactions`;
  }
  function rewardCard(r,tools){
    const cost=Q.balance(state),name=r.name.toLowerCase(),glyph=name.includes('coffee')?'coffee':name.includes('game')?'game':'gift';
    return `<article class="reward-card"><div class="reward-title"><span class="reward-icon">${icon(glyph)}</span><h3>${esc(r.name)}</h3></div><p>${r.cost} credits${r.minutes?' · '+r.minutes+' min':''}</p><button class="redeem" data-redeem="${esc(r.id)}" ${cost<r.cost?'disabled':''}>${cost<r.cost?'Need '+(r.cost-cost)+' more credits':'Redeem'}</button>${tools?`<div class="reward-tools"><button class="icon-button" data-edit-reward="${esc(r.id)}" aria-label="Edit ${esc(r.name)}">${icon('edit')}</button><button class="icon-button danger" data-delete-reward="${esc(r.id)}" aria-label="Delete ${esc(r.name)}">${icon('trash')}</button></div>`:''}</article>`;
  }
  function renderRewards(){
    const head=`<div class="between"><div><span class="eyebrow">${icon('gift')} REWARD EXCHANGE</span><p>Complete missions → earn credits → redeem a break.</p></div><button data-action="add-reward">${icon('plus')}New reward</button></div>`;
    $('#quick-rewards').innerHTML=head+`<div class="reward-grid">${state.rewards.slice(-3).reverse().map(r=>rewardCard(r,false)).join('')||'<p>Add a reward to work toward.</p>'}</div><p class="small">10 credits per mission · ${Q.balance(state)} available · <a href="#rewards">All rewards & redemption history →</a></p>`;
    $('#all-rewards').innerHTML=head+`<div class="reward-grid">${state.rewards.map(r=>rewardCard(r,true)).join('')||'<p>No rewards yet. Create your first one.</p>'}</div>`;
    const receipts=state.ledger.filter(l=>l.type==='reward').slice().reverse();
    $('#redemptions').innerHTML=receipts.map(r=>`<div class="list-line"><div><strong>${esc(r.label)}</strong><p>${stamp(r.at)}${r.minutes?' · '+r.minutes+' min break':''}</p></div><span>${r.amount} credits</span></div>`).join('')||'<p class="small">No rewards redeemed yet.</p>';
  }
  const statusLabel={queued:'Queued',progress:'In progress',done:'Completed'};
  function taskCard(t){
    return `<article class="task-card ${t.status==='done'?'done':''}"><input type="checkbox" data-complete="${esc(t.id)}" aria-label="Complete ${esc(t.title)}" ${t.status==='done'?'checked':''}><div class="task-main"><strong>${esc(t.title)}</strong><div class="task-meta"><span>${icon('tag')} ${esc(t.category)}</span><span class="priority ${t.priority}">${t.priority==='high'?'↑↑':t.priority==='medium'?'↑':'↓'} ${t.priority}</span><span class="${t.due<Q.day()&&t.status!=='done'?'overdue':''}">${esc(t.due)}${t.due<Q.day()&&t.status!=='done'?' · overdue':''}</span><span class="xp-reward">${t.earnedXp?'✓ '+t.earnedXp:'+'+Q.xpFor(t.priority)} XP</span></div></div><div class="task-actions"><select class="task-status" data-status="${esc(t.id)}" aria-label="Status of ${esc(t.title)}">${Object.entries(statusLabel).map(([k,v])=>`<option value="${k}" ${t.status===k?'selected':''}>${v}</option>`).join('')}</select><div class="task-tools">${t.status!=='done'?`<button data-focus="${esc(t.id)}" aria-label="Focus on ${esc(t.title)}">${icon('timer')}</button>`:''}<button data-edit-task="${esc(t.id)}" aria-label="Edit ${esc(t.title)}">${icon('edit')}</button><button data-delete-task="${esc(t.id)}" aria-label="Delete ${esc(t.title)}">${icon('trash')}</button></div></div></article>`;
  }
  function renderTasks(){
    const today=Q.day(),scope=$('#task-scope').value,query=$('#task-search').value.toLowerCase(),cat=$('#task-category').value;
    const daily=state.tasks.filter(t=>!t.deletedAt&&t.due===today),done=daily.filter(t=>t.status==='done').length;
    $('#daily-label').textContent=daily.length?`${done} of ${daily.length} missions due today cleared · ${state.tasks.filter(t=>t.completedAt&&Q.day(new Date(t.completedAt))===today).length} completions today`:'A clear runway. Add a mission to start earning XP.';
    $('#daily-progress').max=daily.length||1;$('#daily-progress').value=done;
    let rows=state.tasks.filter(t=>!t.deletedAt&&(scope==='done'?t.status==='done':t.status!=='done')&&(scope!=='today'||t.due===today)&&(scope!=='overdue'||t.due<today)&&(!cat||cat===t.category)&&(t.title+' '+t.category).toLowerCase().includes(query));
    const rank={high:0,medium:1,low:2};rows.sort((a,b)=>rank[a.priority]-rank[b.priority]||a.due.localeCompare(b.due)||a.createdAt.localeCompare(b.createdAt));
    $('#task-count').textContent=`${rows.length} shown`;
    const groups=new Map();
    rows.forEach(t=>{const k=prefs.group==='status'?statusLabel[t.status]:prefs.group==='priority'?t.priority[0].toUpperCase()+t.priority.slice(1)+' priority':t.category;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(t);});
    $('#task-list').className=(prefs.layout==='board'?'board':'list')+(prefs.compact?' compact':'');
    $('#task-list').innerHTML=[...groups].map(([name,items])=>`<details class="group" data-group="${esc(prefs.group+':'+name)}" ${prefs.collapsed[prefs.group+':'+name]?'':'open'}><summary>${esc(name)}<span class="group-count">${items.length}</span></summary>${items.map(taskCard).join('')}</details>`).join('')||`<div class="empty"><h3>${state.tasks.length?'No matching missions.':'Your first mission starts here.'}</h3><p>${state.tasks.length?'Try another scope, category or search.':'Add a task, choose its priority and earn 10 credits on first completion.'}</p><button class="primary" data-action="add-task">${icon('plus')}New mission</button></div>`;
    $$('#task-list details').forEach(d=>d.addEventListener('toggle',()=>{prefs.collapsed[d.dataset.group]=!d.open;preferences();}));
    $$('[data-layout]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.layout===prefs.layout)));$('#group-by').value=prefs.group;$('#compact').checked=prefs.compact;
  }
  function historyFilters(){return {date:$('#history-date').value||Q.day(),period:$('#history-period').value,basis:$('#history-basis').value,category:$('#history-category').value,status:$('#history-status').value,query:$('#history-search').value};}
  function renderHistory(){
    const f=historyFilters(),rows=Q.history(state,f),size=30,pages=Math.max(1,Math.ceil(rows.length/size));historyPage=Math.min(historyPage,pages-1);
    const [start,end]=Q.range(f.date,f.period);const last=new Date(+end-1);
    $('#history-summary').textContent=`${start.toLocaleDateString()} – ${last.toLocaleDateString()} · ${rows.length} matching tasks`;
    $('#history-list').innerHTML=rows.slice(historyPage*size,(historyPage+1)*size).map(t=>`<article class="history-card"><div class="between"><h3>${esc(t.title)}</h3><span class="small">${t.deletedAt?'Deleted':statusLabel[t.status]}</span></div><p class="small">${esc(t.category)} · ${t.priority} · due ${esc(t.due)} · ${t.earnedXp} XP earned</p><p class="small">Created ${stamp(t.createdAt)} · Completed ${stamp(t.completedAt)}</p><details><summary>Activity history (${t.events.length})</summary><ul>${t.events.map(e=>`<li>${esc(e.type)} · ${stamp(e.at)}</li>`).join('')}</ul></details>${!t.deletedAt?`<button class="icon-button" data-edit-task="${esc(t.id)}">${icon('edit')}Edit mission</button>`:''}</article>`).join('')||'<div class="empty">No tasks match this period and filters.</div>';
    if(pages>1)$('#history-list').insertAdjacentHTML('beforeend',`<div class="pager"><button data-history-page="-1" ${historyPage===0?'disabled':''}>← Previous</button><span>Page ${historyPage+1} / ${pages}</span><button data-history-page="1" ${historyPage===pages-1?'disabled':''}>Next →</button></div>`);
    const sessions=state.sessions.filter(t=>new Date(t.endedAt)>=start&&new Date(t.endedAt)<end&&(!f.category||state.tasks.find(v=>v.id===t.taskId)?.category===f.category)&&t.title.toLowerCase().includes(f.query.toLowerCase())).slice().reverse();
    $('#sessions').innerHTML=sessions.map(t=>`<div class="list-line"><div>${esc(t.title)}<p>${stamp(t.endedAt)}</p></div><span>${Math.round(t.seconds/60)} min</span></div>`).join('')||'<p class="small">No completed focus sessions in this period.</p>';
  }
  function renderTimer(){
    const selected=state.timer?.taskId||$('#timer-task').value;
    const active=state.tasks.filter(t=>!t.deletedAt&&t.status!=='done');
    if(state.timer&&!active.some(t=>t.id===state.timer.taskId))active.push({id:state.timer.taskId,title:state.timer.title});
    $('#timer-task').innerHTML=active.map(t=>`<option value="${esc(t.id)}">${esc(t.title)}</option>`).join('')||'<option value="">Add an active mission first</option>';
    if(active.some(t=>t.id===selected))$('#timer-task').value=selected;
    const locked=!!state.timer;$('#timer-task').disabled=locked;$('#timer-minutes').disabled=locked;
    $$('[data-minutes]').forEach(b=>{b.disabled=locked;b.setAttribute('aria-pressed',String(Number(b.dataset.minutes)===(locked?state.timer.seconds/60:selectedMinutes)));});
    $('#timer-start').disabled=!active.length;$('#timer-reset').disabled=!locked;
    $('#timer-start').textContent=locked?(state.timer.deadline?'Ⅱ Pause':'▶ Resume'):'▶ Start focus';
    $('#timer-status').textContent=locked?(state.timer.deadline?'Focus session active':'Paused'):'Ready';
    $('.timer-panel').classList.toggle('folded',!!prefs.timerFolded);$('#timer-fold').textContent=prefs.timerFolded?'Expand timer':'Collapse timer';$('#timer-fold').setAttribute('aria-expanded',String(!prefs.timerFolded));
    tickClock();
  }
  function tickClock(){const left=state.timer?Q.remaining(state):selectedMinutes*60;$('#clock').textContent=String(Math.floor(left/60)).padStart(2,'0')+':'+String(left%60).padStart(2,'0');}
  function openTask(id){
    const t=state.tasks.find(t=>t.id===id);$('#task-form').reset();$('#task-id').value=t?.id||'';$('#task-form-title').textContent=t?'Edit mission':'New mission';$('#task-title').value=t?.title||'';$('#task-category-input').value=t?.category||'Work';$('#task-priority').value=t?.priority||'medium';$('#task-due').value=t?.due||Q.day();$('#task-dialog').showModal();
  }
  function openReward(id){const r=state.rewards.find(r=>r.id===id);$('#reward-form').reset();$('#reward-id').value=r?.id||'';$('#reward-name').value=r?.name||'';$('#reward-cost').value=r?.cost||50;$('#reward-minutes').value=r?.minutes||'';$('#reward-dialog h2').textContent=r?'Edit reward':'New reward';$('#reward-dialog').showModal();}
  $('#task-form').onsubmit=e=>{e.preventDefault();if(change(()=>Q.task(state,{title:$('#task-title').value,category:$('#task-category-input').value,priority:$('#task-priority').value,due:$('#task-due').value},$('#task-id').value),'Mission saved.'))$('#task-dialog').close();};
  $('#reward-form').onsubmit=e=>{e.preventDefault();if(change(()=>Q.reward(state,{name:$('#reward-name').value,cost:$('#reward-cost').value,minutes:$('#reward-minutes').value},$('#reward-id').value),'Reward saved.'))$('#reward-dialog').close();};
  document.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b||b.disabled)return;
    if(b.dataset.action==='add-task')openTask();
    if(b.dataset.action==='add-reward')openReward();
    if(b.dataset.editTask)openTask(b.dataset.editTask);
    if(b.dataset.editReward)openReward(b.dataset.editReward);
    if(b.dataset.deleteTask)confirmation('Delete this mission?','It will leave the mission queue. Its history and previously earned XP and credits are preserved.',()=>change(()=>Q.remove(state,b.dataset.deleteTask),'Mission deleted; history kept.'));
    if(b.dataset.deleteReward)confirmation('Remove this reward?','Past redemptions stay in your history.',()=>change(()=>{state.rewards=state.rewards.filter(r=>r.id!==b.dataset.deleteReward);},'Reward removed.'));
    if(b.dataset.redeem){const r=state.rewards.find(r=>r.id===b.dataset.redeem);confirmation('Redeem '+r.name+'?',`Spend ${r.cost} credits? Your balance will be ${Q.balance(state)-r.cost}.`,()=>change(()=>Q.redeem(state,r.id),'Reward redeemed. Enjoy your break!'));}
    if(b.dataset.focus){if(state.timer){notify('Finish or reset your current focus session first.');return;}$('#timer-task').value=b.dataset.focus;$('.timer-panel').scrollIntoView({behavior:'smooth',block:'center'});$('#timer-start').focus();}
    if(b.dataset.layout){prefs.layout=b.dataset.layout;preferences();renderTasks();}
    if(b.dataset.minutes){selectedMinutes=Number(b.dataset.minutes);$('#timer-minutes').value=selectedMinutes;renderTimer();}
    if(b.dataset.historyPage){historyPage+=Number(b.dataset.historyPage);renderHistory();}
  });
  $('#task-list').addEventListener('change',e=>{
    const el=e.target;if(el.dataset.complete)change(()=>Q.status(state,el.dataset.complete,el.checked?'done':'queued'),el.checked?'Mission cleared. First completion earns XP and 10 credits.':'Mission reopened.');
    if(el.dataset.status)change(()=>Q.status(state,el.dataset.status,el.value),'Status updated.');
  });
  ['#task-search','#task-scope','#task-category'].forEach(id=>$(id).addEventListener('input',renderTasks));
  $('#group-by').onchange=e=>{prefs.group=e.target.value;preferences();renderTasks();};
  $('#compact').onchange=e=>{prefs.compact=e.target.checked;preferences();renderTasks();};
  function expand(open){$$('#task-list .group').forEach(d=>{d.open=open;prefs.collapsed[d.dataset.group]=!open;});preferences();}
  $('#expand-all').onclick=()=>expand(true);$('#collapse-all').onclick=()=>expand(false);
  $$('.history-filters input,.history-filters select').forEach(el=>el.addEventListener('input',()=>{historyPage=0;if($('#history-date').checkValidity()&&$('#history-date').value)renderHistory();}));
  $('#history-date').value=Q.day();
  $('#timer-minutes').onchange=e=>{if(e.target.checkValidity()&&e.target.value){selectedMinutes=Number(e.target.value);renderTimer();}};
  $('#timer-start').onclick=()=>{
    if(!$('#timer-minutes').reportValidity()||!$('#timer-minutes').value)return;
    change(()=>state.timer?Q.toggleTimer(state):Q.startTimer(state,$('#timer-task').value,Number($('#timer-minutes').value)));
  };
  $('#timer-reset').onclick=()=>confirmation('Reset this focus session?','The current session will be discarded. Completed sessions stay in history.',()=>change(()=>{state.timer=null;},'Timer reset.'));
  $('#timer-fold').onclick=()=>{prefs.timerFolded=!prefs.timerFolded;preferences();renderTimer();};
  setInterval(()=>{if(state.timer?.deadline&&Q.remaining(state)===0){change(()=>Q.finishTimer(state),'Focus session complete. Take a break!');}else tickClock();if($('#today-label').dataset.date!==Q.day()){$('#today-label').dataset.date=Q.day();renderTasks();}},1000);
  function route(){currentPage=['missions','history','rewards','data'].includes(location.hash.slice(1))?location.hash.slice(1):'missions';$$('.page').forEach(p=>p.hidden=p.id!==currentPage+'-page');$$('nav a').forEach(a=>{if(a.dataset.page===currentPage)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});const titles={missions:['Your next objective.','Lock in. Clear your missions. Upgrade your day.'],history:['Your mission archive.','Every step forward leaves a trace.'],rewards:['Work hard. Recharge well.','Build a reward system that works for you.'],data:['Take your progress anywhere.','Simple files. Your data. No lock-in.']};$('#page-title').textContent=titles[currentPage][0];$('#page-subtitle').textContent=titles[currentPage][1];}
  window.addEventListener('hashchange',route);
  window.addEventListener('storage',e=>{if(e.key!==KEY)return;try{if(!e.newValue)throw Error('Saved data was removed in another tab.');state=Q.validate(JSON.parse(e.newValue));storedRaw=e.newValue;render();notify('Updated from another tab.');}catch{notify('Data changed in another tab. Reload before editing.');}});
  $('#export').onclick=()=>{const blob=new Blob([JSON.stringify({...state,exportedAt:Q.now()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='quest-os-backup-'+Q.day()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Backup exported. Keep it somewhere safe.');};
  $('#import-open').onclick=()=>$('#import-file').click();
  $('#import-file').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>5*1024*1024)throw Error('Backup is larger than the 5 MB import limit.');const imported=Q.validate(JSON.parse(await file.text()));confirmation('Replace this device’s data?',`Import ${imported.tasks.length} tasks, ${imported.rewards.length} rewards and ${imported.sessions.length} sessions? This replaces current data. Export a backup first if needed.`,()=>change(()=>{state=imported;},'Backup imported.'));}catch(err){notify(err.message||'Could not read this backup.');}};
  if(!storedRaw&&!storageBlocked){try{storedRaw=JSON.stringify(state);localStorage.setItem(KEY,storedRaw);}catch{storageBlocked=true;$('#storage-error').hidden=false;$('#storage-error').textContent='Browser storage is unavailable. Enable site storage to save your progress.';}}
  if(state.timer?.deadline&&Q.remaining(state)===0)change(()=>Q.finishTimer(state),'Your focus session finished while you were away.');
  render();route();
})();
