/* QUEST//OS: static browser storage or a same-origin, SQLite-backed LAN server. */
(async()=>{
  'use strict';
  const Q=globalThis.Quest, KEY='quest-os-v1', VIEW='quest-os-view-v1';
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=name=>`<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const stamp=v=>v?new Date(v).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'—';
  const shared=!!globalThis.QUEST_SERVER?.enabled;
  async function request(url,options={}){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),6000);
    try{return await fetch(url,{...options,signal:controller.signal});}finally{clearTimeout(timeout);}
  }
  let revision=null, saving=false, polling=false;
  let state, raw, storageBlocked=false, toastTimeout, selectedMinutes=25, currentPage='missions', historyPage=0, confirmAction;
  let prefs={layout:'board',group:'status',compact:false,collapsed:{},timerFolded:false};
  if(shared){
    state=Q.initial();storageBlocked=true;
    try{const response=await request('api/state',{cache:'no-store'});if(!response.ok)throw Error('Server unavailable');const data=await response.json();state=Q.validate(data.state);revision=data.revision;storageBlocked=false;}catch{$('#storage-error').hidden=false;$('#storage-error').textContent='Cannot reach the shared database. Check that server.py is running; reconnect to continue. Local browser data has not been changed.';}
  }else{
    try{raw=localStorage.getItem(KEY);state=raw?Q.validate(JSON.parse(raw)):Q.initial();}catch(e){state=Q.initial();storageBlocked=true;$('#storage-error').hidden=false;$('#storage-error').textContent='Saved data could not be read. Changes are blocked to protect it. Export available data or try this browser’s normal mode.';}
  }
  try{const p=JSON.parse(localStorage.getItem(VIEW)||'null');if(p&&['board','list'].includes(p.layout)&&['status','category','priority'].includes(p.group))prefs={...prefs,...p};}catch{}
  let storedRaw=raw||null;
  function notify(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('#toast').hidden=true,5000);}
  function preferences(){try{localStorage.setItem(VIEW,JSON.stringify(prefs));}catch{} }
  async function change(fn,message){
    if(saving){notify('A save is still in progress. Please try again in a moment.');return false;}
    if(storageBlocked){notify(shared?'Reconnect to your shared server before making changes.':'Storage is unavailable. Export a backup before making changes.');return false;}
    saving=true;
    const before=JSON.stringify(state);
    try{
      if(!shared&&localStorage.getItem(KEY)!==storedRaw)throw Error('Another tab changed your data. Reload this tab before continuing.');
      fn();const next=JSON.stringify(state);
      if(shared){
        const response=await request('api/state',{method:'PUT',headers:{'Content-Type':'application/json','If-Match':'"'+revision+'"'},body:next});
        if(response.status===409){state=JSON.parse(before);await refreshShared(true);notify('Another device saved first. Your change was not applied; review the latest data and try again.');return false;}
        if(!response.ok)throw Error((await response.json()).error||'Could not save to the shared database.');
        const data=await response.json();state=Q.validate(data.state);revision=data.revision;
      }else{localStorage.setItem(KEY,next);storedRaw=next;}
      render();if(message)notify(message);return true;
    }catch(e){state=JSON.parse(before);if(shared)await refreshShared(true);render();notify(shared?'Could not confirm save. '+(e.message||'Check the server connection.')+' Review the latest shared data before retrying.':e.message||'Could not save. Your last saved data is unchanged.');return false;}
    finally{saving=false;}
  }
  async function refreshShared(force=false){
    if(!shared||polling||saving&&!force)return;
    polling=true;
    try{
      const response=await request('api/state',{cache:'no-store',headers:revision===null?{}:{'If-None-Match':'"'+revision+'"'}});
      if(response.status===304){$('#storage-error').hidden=true;return;}
      if(!response.ok)throw Error('Shared server unavailable');
      const data=await response.json(),next=Q.validate(data.state);
      // A save may have begun while the GET was in flight. It owns the current state.
      if(saving&&!force)return;
      if(revision===null||data.revision>revision){state=next;revision=data.revision;storageBlocked=false;render();}
      $('#storage-error').hidden=true;
    }catch{$('#storage-error').hidden=false;$('#storage-error').textContent='Connection to the shared server was lost. Reconnect before editing; unsent changes will not be stored locally.';}
    finally{polling=false;}
  }
  function confirmation(title,text,fn){$('#confirm-title').textContent=title;$('#confirm-text').textContent=text;confirmAction=fn;$('#confirm-dialog').showModal();}
  $('#confirm-yes').onclick=()=>{const action=confirmAction;$('#confirm-dialog').close();confirmAction=null;action?.();};
  $$('[data-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.close).close());
  function categories(){return state.categories.slice().sort((a,b)=>a.localeCompare(b));}
  function selectCategories(id){const el=$(id),value=el.value;el.innerHTML='<option value="">All categories</option>'+categories().map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');el.value=categories().includes(value)?value:'';}
  function renderCategories(){
    const select=$('#task-category-input'),selected=select.value;
    select.innerHTML=categories().map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
    select.value=state.categories.includes(selected)?selected:state.categories[0];
    $('#category-list').innerHTML=categories().map((name,i)=>{
      const count=state.tasks.filter(t=>t.category===name).length;
      return `<form class="category-row" data-rename-category="${esc(name)}"><label for="category-edit-${i}">Category name<input id="category-edit-${i}" name="categoryName" value="${esc(name)}" required maxlength="40" aria-label="Rename ${esc(name)}"></label><span class="small">${count} task${count===1?'':'s'}</span><div class="category-actions"><button type="submit" aria-label="Save category ${esc(name)}">Save</button><button type="button" class="danger" data-delete-category="${esc(name)}" ${state.categories.length===1?'disabled':''}>Delete</button></div></form>`;
    }).join('');
  }
  function render(){
    const xp=Q.xp(state),level=Math.floor(xp/200)+1;
    $('#balance').textContent=Q.balance(state);$('#level').textContent=String(level).padStart(2,'0');$('#xp-label').textContent=`LEVEL ${level} · ${xp%200} / 200 XP`;$('#xp').value=xp%200;
    $('#today-label').textContent=new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'}).toUpperCase();
    selectCategories('#task-category');selectCategories('#history-category');selectCategories('#metrics-category');renderCategories();
    renderRewards();renderTasks();renderHistory();renderTimer();renderOverdue();renderMetrics();
    $('#data-stats').textContent=`${state.tasks.length} tasks · ${state.rewards.length} rewards · ${state.sessions.length} focus sessions · ${state.ledger.length} credit transactions`;
    $('#export').disabled=shared&&revision===null;
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
  const effortLabel={small:'Small',medium:'Medium',large:'Large',epic:'Major'};
  const statusLabel={queued:'Queued',progress:'In progress',done:'Completed'};
  function taskCard(t){
    return `<article class="task-card ${t.status==='done'?'done':''} ${t.due<Q.day()&&t.status!=='done'?'is-overdue':''}"><input type="checkbox" data-complete="${esc(t.id)}" aria-label="Complete ${esc(t.title)}" ${t.status==='done'?'checked':''}><div class="task-main"><strong>${esc(t.title)}</strong>${t.due<Q.day()&&t.status!=='done'?'<span class="overdue-tag">OVERDUE</span>':''}<div class="task-meta"><span>${icon('tag')} ${esc(t.category)}</span><span>${esc(effortLabel[t.effort])} effort</span><span class="priority ${t.priority}">${t.priority==='high'?'↑↑':t.priority==='medium'?'↑':'↓'} ${t.priority}</span><span class="${t.due<Q.day()&&t.status!=='done'?'overdue':''}">${esc(t.due)}${t.due<Q.day()&&t.status!=='done'?' · OVERDUE':''}</span><span class="xp-reward">${t.earnedXp?'✓ '+t.earnedXp:'+'+Q.xpFor(t.priority,t.effort)} XP</span></div></div><div class="task-actions"><select class="task-status" data-status="${esc(t.id)}" aria-label="Status of ${esc(t.title)}">${Object.entries(statusLabel).map(([k,v])=>`<option value="${k}" ${t.status===k?'selected':''}>${v}</option>`).join('')}</select><div class="task-tools">${t.status!=='done'?`<button data-focus="${esc(t.id)}" aria-label="Focus on ${esc(t.title)}">${icon('timer')}</button>`:''}<button data-edit-task="${esc(t.id)}" aria-label="Edit ${esc(t.title)}">${icon('edit')}</button><button data-delete-task="${esc(t.id)}" aria-label="Delete ${esc(t.title)}">${icon('trash')}</button></div></div></article>`;
  }
  function renderTasks(){
    const today=Q.day(),scope=$('#task-scope').value,query=$('#task-search').value.toLowerCase(),cat=$('#task-category').value;
    const daily=state.tasks.filter(t=>!t.deletedAt&&t.due===today),done=daily.filter(t=>t.status==='done').length;
    const results=Q.metrics(state,today,'day');
    $('#daily-completed').textContent=results.completed;$('#daily-xp').textContent=results.earnedXp;$('#daily-focus').textContent=results.focusMinutes.toLocaleString(undefined,{maximumFractionDigits:1});
    $('#daily-label').textContent=daily.length?`${done} of ${daily.length} missions due today cleared · ${results.completed} first completions today`:'A clear runway. Add a mission to start earning XP.';
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
  function renderOverdue(){
    const tasks=Q.overdue(state);$('#overdue-banner').hidden=!tasks.length;
    $('#overdue-count').textContent=`${tasks.length} overdue mission${tasks.length===1?'':'s'} need${tasks.length===1?'s':''} a new plan`;
    const next=new Date();next.setDate(next.getDate()+1);
    $('#overdue-list').innerHTML=tasks.map(t=>`<form class="overdue-row" data-reschedule="${esc(t.id)}"><h3>${esc(t.title)}</h3><p class="small">Was due ${esc(t.due)} · ${esc(t.category)} · ${effortLabel[t.effort]} effort</p><div class="form-grid"><label>New priority<select name="priority">${['low','medium','high'].map(p=>`<option value="${p}" ${p===t.priority?'selected':''}>${p} · ${Q.xpFor(p,t.effort)} XP${t.earnedXp?' estimate (already rewarded)':''}</option>`).join('')}</select></label><label>New due date<input name="due" type="date" min="${Q.day()}" value="${Q.day()}" required></label></div><div class="actions"><button type="button" data-due-preset="${Q.day()}">Today</button><button type="button" data-due-preset="${Q.day(next)}">Tomorrow</button><button type="submit" class="primary">Save new plan</button></div></form>`).join('')||'<p class="empty">All caught up. No overdue missions remain.</p>';
  }
  $('#overdue-filter').onclick=()=>{$('#task-scope').value='overdue';$('#task-search').value='';$('#task-category').value='';renderTasks();$('#task-list').scrollIntoView({behavior:'smooth',block:'start'});};
  $('#overdue-list').addEventListener('submit',async e=>{e.preventDefault();const form=e.target;await change(()=>Q.reschedule(state,form.dataset.reschedule,form.elements.due.value,form.elements.priority.value),'Task rescheduled. Previous due date kept in history.');});
  function historyFilters(){return {date:$('#history-date').value||Q.day(),period:$('#history-period').value,basis:$('#history-basis').value,category:$('#history-category').value,status:$('#history-status').value,query:$('#history-search').value};}
  function renderHistory(){
    const f=historyFilters(),rows=Q.history(state,f),size=30,pages=Math.max(1,Math.ceil(rows.length/size));historyPage=Math.min(historyPage,pages-1);
    const [start,end]=Q.range(f.date,f.period);const last=new Date(+end-1);
    $('#history-summary').textContent=`${start.toLocaleDateString()} – ${last.toLocaleDateString()} · ${rows.length} matching tasks`;
    $('#history-list').innerHTML=rows.slice(historyPage*size,(historyPage+1)*size).map(t=>`<article class="history-card"><div class="between"><h3>${esc(t.title)}</h3><span class="small">${t.deletedAt?'Deleted':statusLabel[t.status]}</span></div><p class="small">${esc(t.category)} · ${t.priority} · ${esc(effortLabel[t.effort])} effort · due ${esc(t.due)} · ${t.earnedXp} XP earned</p><p class="small">Created ${stamp(t.createdAt)} · Completed ${stamp(t.completedAt)}</p><details><summary>Activity history (${t.events.length})</summary><ul>${t.events.map(e=>`<li>${esc(e.type)}${e.type==='category_changed'?' · '+esc(e.from)+' → '+esc(e.to):e.type==='rescheduled'?' · '+esc(e.fromDue)+' → '+esc(e.toDue)+' · '+esc(e.fromPriority)+' → '+esc(e.toPriority):e.type==='reprioritized'?' · '+esc(e.fromPriority)+' → '+esc(e.toPriority):''} · ${stamp(e.at)}</li>`).join('')}</ul></details>${!t.deletedAt?`<button class="icon-button" data-edit-task="${esc(t.id)}">${icon('edit')}Edit mission</button>`:''}</article>`).join('')||'<div class="empty">No tasks match this period and filters.</div>';
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
  function renderMetrics(){
    const date=$('#metrics-date').value||Q.day(),period=$('#metrics-period').value;
    const m=Q.metrics(state,date,period,$('#metrics-category').value);
    const label=d=>new Date(d+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'});
    $('#metrics-range').textContent=`${label(m.start)} – ${label(m.end)} · ${m.future?'Upcoming period':m.partial?'So far':'Completed period'} · Local time`;
    $('#metric-completed').textContent=m.completed;
    $('#metric-ontime').textContent=m.onTimeRate===null?'—':m.onTimeRate+'%';
    $('#metric-ontime-detail').textContent=m.completed?`${m.onTime} of ${m.completed} completed on time`:'No first completions in this period';
    $('#metric-xp').textContent=m.earnedXp;
    $('#metric-focus').textContent=m.focusMinutes.toLocaleString(undefined,{maximumFractionDigits:1});
    $('#metric-focus-detail').textContent=`${m.sessionCount} completed focus session${m.sessionCount===1?'':'s'}`;
    $('#metric-overdue').textContent=m.overdue;
    $('#metric-overdue-detail').textContent=m.future?'No actual carryover yet':m.partial?'Overdue and unfinished right now':'Overdue and unfinished at period end';
    $('#on-time-arc').setAttribute('stroke-dasharray',`${m.onTimeRate??0} ${100-(m.onTimeRate??0)}`);
    $('#metrics-trend-title').textContent=period==='week'?'This week at a glance':'Trailing seven-day trends';
    const compact=v=>v.toLocaleString(undefined,{notation:'compact',maximumFractionDigits:1});
    const charts=[{key:'completed',title:'Completed tasks',unit:'tasks'},{key:'earnedXp',title:'XP earned',unit:'XP'},{key:'focusMinutes',title:'Focus time',unit:'minutes'}];
    $('#metrics-trend').innerHTML=charts.map(chart=>{
      const actualMax=Math.max(...m.trend.map(v=>v[chart.key])),max=actualMax||1;
      const summary=m.trend.map(v=>`${v.date}: ${v.future?'upcoming':v[chart.key]+' '+chart.unit}`).join('; ');
      return `<figure class="trend-chart"><figcaption><h3>${chart.title}</h3><span class="small">${actualMax?'0–'+compact(max)+' '+chart.unit:'No activity recorded'}</span></figcaption><div class="trend-columns" role="img" aria-label="${esc(chart.title+': '+summary)}">${m.trend.map(v=>{
        const height=v[chart.key]/max*100,weekday=new Date(v.date+'T12:00:00').toLocaleDateString(undefined,{weekday:'short'});
        return `<div class="trend-column ${v.future?'is-future':''}"><span class="bar-value">${v.future?'—':compact(v[chart.key])}</span><svg class="trend-mark" viewBox="0 0 30 100" preserveAspectRatio="none" aria-hidden="true"><rect class="bar-track" x="4" y="0" width="22" height="100"/><rect class="bar-fill" x="4" y="${100-height}" width="22" height="${height}" rx="1"/></svg><span class="bar-day" title="${esc(v.date)}">${esc(weekday)}</span></div>`;
      }).join('')}</div><p class="small">${label(m.trend[0].date)} – ${label(m.trend[6].date)}</p></figure>`;
    }).join('');
  }
  $$('.metrics-filters input,.metrics-filters select').forEach(el=>el.addEventListener('input',()=>{if($('#metrics-date').value&&$('#metrics-date').checkValidity())renderMetrics();}));
  $('#metrics-date').value=Q.day();
  $('#metrics-current').onclick=()=>{$('#metrics-date').value=Q.day();renderMetrics();};
  function moveMetrics(direction){const date=new Date(($('#metrics-date').value||Q.day())+'T12:00:00');date.setDate(date.getDate()+direction*($('#metrics-period').value==='week'?7:1));$('#metrics-date').value=Q.day(date);renderMetrics();}
  $('#metrics-prev').onclick=()=>moveMetrics(-1);$('#metrics-next').onclick=()=>moveMetrics(1);
  function tickClock(){const left=state.timer?Q.remaining(state):selectedMinutes*60;$('#clock').textContent=String(Math.floor(left/60)).padStart(2,'0')+':'+String(left%60).padStart(2,'0');}
  function openTask(id){
    const t=state.tasks.find(t=>t.id===id);$('#task-form').reset();$('#task-id').value=t?.id||'';$('#task-form-title').textContent=t?'Edit mission':'New mission';$('#task-title').value=t?.title||'';$('#task-category-input').value=t?.category||state.categories[0];$('#task-priority').value=t?.priority||'medium';$('#task-effort').value=t?.effort||'medium';$('#task-due').value=t?.due||Q.day();renderXpPreview();$('#task-dialog').showModal();
  }
  function openReward(id){const r=state.rewards.find(r=>r.id===id);$('#reward-form').reset();$('#reward-id').value=r?.id||'';$('#reward-name').value=r?.name||'';$('#reward-cost').value=r?.cost||50;$('#reward-minutes').value=r?.minutes||'';$('#reward-dialog h2').textContent=r?'Edit reward':'New reward';$('#reward-dialog').showModal();}
  $('#category-form').onsubmit=async e=>{
    e.preventDefault();
    if(await change(()=>Q.saveCategory(state,$('#category-name').value),'Category added.')){$('#category-form').reset();$('#category-name').focus();}
  };
  $('#category-list').addEventListener('submit',async e=>{
    e.preventDefault();const form=e.target,previous=form.dataset.renameCategory;
    const name=form.elements.categoryName.value.trim();
    const selected=['#task-category','#history-category','#metrics-category','#task-category-input'].filter(id=>$(id).value===previous);
    if(await change(()=>Q.saveCategory(state,name,previous),'Category updated.')){
      selected.forEach(id=>$(id).value=name);renderTasks();renderHistory();renderMetrics();
    }
  });
  $('#category-delete-form').onsubmit=async e=>{
    e.preventDefault();const name=$('#category-delete-name').value,replacement=$('#category-move-to').value;
    const selected=$('#task-category-input').value===name;
    if(await change(()=>Q.deleteCategory(state,name,replacement),'Category deleted. Existing tasks were kept.')){if(selected&&replacement)$('#task-category-input').value=replacement;$('#category-delete-dialog').close();}
  };
  function renderXpPreview(){
    const t=state.tasks.find(t=>t.id===$('#task-id').value),priority=$('#task-priority').value,effort=$('#task-effort').value;
    $('#task-xp-preview').textContent=t?.earnedXp?`Already earned: ${t.earnedXp} XP. Editing or reopening won't grant additional XP.`:`${Q.xpFor(priority)} base XP × ${Q.effortFactors[effort]} effort = ${Q.xpFor(priority,effort)} XP on first completion`;
  }
  $('#task-priority').addEventListener('change',renderXpPreview);
  $('#task-effort').addEventListener('change',renderXpPreview);
  $('#task-form').onsubmit=async e=>{e.preventDefault();if(await change(()=>Q.task(state,{title:$('#task-title').value,category:$('#task-category-input').value,priority:$('#task-priority').value,effort:$('#task-effort').value,due:$('#task-due').value},$('#task-id').value),'Mission saved.'))$('#task-dialog').close();};
  $('#reward-form').onsubmit=async e=>{e.preventDefault();if(await change(()=>Q.reward(state,{name:$('#reward-name').value,cost:$('#reward-cost').value,minutes:$('#reward-minutes').value},$('#reward-id').value),'Reward saved.'))$('#reward-dialog').close();};
  document.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b||b.disabled)return;
    if(b.dataset.action==='add-task')openTask();
    if(b.dataset.action==='add-reward')openReward();
    if(b.dataset.action==='review-overdue'){renderOverdue();$('#overdue-dialog').showModal();}
    if(b.dataset.duePreset)b.closest('form').elements.due.value=b.dataset.duePreset;
    if(b.dataset.action==='manage-categories'){renderCategories();$('#category-dialog').showModal();}
    if(b.dataset.deleteCategory){
      const name=b.dataset.deleteCategory,count=state.tasks.filter(t=>t.category===name).length;
      $('#category-delete-name').value=name;
      $('#category-delete-summary').textContent=`Delete “${name}”? ${count} task record${count===1?' uses':'s use'} this category.`;
      $('#category-move-to').innerHTML=categories().filter(c=>c!==name).map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
      $('#category-move-label').hidden=!count;
      $('#category-delete-dialog').showModal();
    }
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
  setInterval(()=>{if(!saving&&state.timer?.deadline&&Q.remaining(state)===0){change(()=>Q.finishTimer(state),'Focus session complete. Take a break!');}else tickClock();if($('#today-label').dataset.date!==Q.day()){$('#today-label').dataset.date=Q.day();renderTasks();renderOverdue();renderMetrics();}},1000);
  function route(){currentPage=['missions','history','metrics','rewards','data'].includes(location.hash.slice(1))?location.hash.slice(1):'missions';$$('.page').forEach(p=>p.hidden=p.id!==currentPage+'-page');$$('nav a').forEach(a=>{if(a.dataset.page===currentPage)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});const titles={metrics:['Your progress, measured.','Review your daily output, focus and delivery.'],missions:['Your next objective.','Lock in. Clear your missions. Upgrade your day.'],history:['Your mission archive.','Every step forward leaves a trace.'],rewards:['Work hard. Recharge well.','Build a reward system that works for you.'],data:['Take your progress anywhere.','Simple files. Your data. No lock-in.']};$('#page-title').textContent=titles[currentPage][0];$('#page-subtitle').textContent=titles[currentPage][1];if(currentPage==='metrics')renderMetrics();}
  window.addEventListener('hashchange',route);
  window.addEventListener('storage',e=>{if(shared||e.key!==KEY)return;try{if(!e.newValue)throw Error('Saved data was removed in another tab.');state=Q.validate(JSON.parse(e.newValue));storedRaw=e.newValue;render();notify('Updated from another tab.');}catch{notify('Data changed in another tab. Reload before editing.');}});
  $('#export').onclick=()=>{const blob=new Blob([JSON.stringify({...state,exportedAt:Q.now()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='quest-os-backup-'+Q.day()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Backup exported. Keep it somewhere safe.');};
  $('#import-open').onclick=()=>$('#import-file').click();
  $('#import-file').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>5*1024*1024)throw Error('Backup is larger than the 5 MB import limit.');const imported=Q.validate(JSON.parse(await file.text()));confirmation(shared?'Replace the shared workspace?':'Replace this device’s data?',`Import ${imported.tasks.length} tasks, ${imported.rewards.length} rewards and ${imported.sessions.length} sessions? This replaces ${shared?'data for every connected device':'current data'}. Export a backup first if needed.`,()=>change(()=>{state=imported;},'Backup imported.'));}catch(err){notify(err.message||'Could not read this backup.');}};
  if(!shared&&!storedRaw&&!storageBlocked){try{storedRaw=JSON.stringify(state);localStorage.setItem(KEY,storedRaw);}catch{storageBlocked=true;$('#storage-error').hidden=false;$('#storage-error').textContent='Browser storage is unavailable. Enable site storage to save your progress.';}}
  if(state.timer?.deadline&&Q.remaining(state)===0)change(()=>Q.finishTimer(state),'Your focus session finished while you were away.');
  if(shared){
    $('.storage-label').innerHTML='SQLite shared workspace<br>Updates across devices';
    $('footer span').textContent='LAN SYNC · SQLITE · ZERO DEPENDENCIES';
    $('#data-page h2').textContent='One workspace. Every device.';
    $('#data-page .data-card>p').textContent='Tasks, rewards, focus sessions and credits are saved in SQLite on the host Mac. Connected devices refresh automatically every three seconds. Browser-local data is kept separate.';
    const notes=$$('#data-page .small');
    notes[0].textContent='Import replaces the shared workspace for ALL connected devices after confirmation. Export a backup first. To move existing browser data here, export it from the old app and import it once.';
    notes[1].textContent='Keep the host Mac awake and server.py running. This is one shared workspace, not separate user accounts. If the server is unreachable, changes are not saved locally.';
    setInterval(()=>refreshShared(),3000);
    window.addEventListener('focus',()=>refreshShared());
  }
  render();route();
})();
