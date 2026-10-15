(() => {
  // This binding lives only in Chrome's isolated content-script world.
  if(globalThis.__otherwiseProactive){globalThis.__otherwiseProactive.wake();return;}
  let host=null,shadow=null,data=null,triedRoute=null,pending=false,sequence=0,timer=null,port=null,connection=null,closed=false,navigating=false;
  const route=()=>location.pathname+location.search;
  const provider=()=>location.origin==='https://www.google.com' && location.pathname==='/search'?'google':location.origin==='https://www.youtube.com' && location.pathname==='/results'?'youtube':null;
  const visible=node=>node && node.isConnected && node.getClientRects().length && getComputedStyle(node).visibility!=='hidden';
  function anchor(){
    if(provider()==='google'){
      const bar=document.querySelector('#appbar');
      return visible(bar)?{node:bar,placement:'after'}:null;
    }
    if(provider()==='youtube'){
      const primary=document.querySelector('ytd-search:not([hidden]) #primary');
      return visible(primary)?{node:primary,placement:'prepend'}:null;
    }
    return null;
  }
  function remove(){host?.remove();host=null;shadow=null;}
  const send=message=>chrome.runtime.sendMessage(message);
  function connect(){
    if(connection)return connection;
    let finish;
    connection=new Promise(resolve=>{finish=resolve;});
    const promise=connection;
    try{
      const candidate=chrome.runtime.connect({name:'otherwise-proactive'});port=candidate;
      let ready=false;
      const timeout=setTimeout(()=>{finish(false);candidate.disconnect();},5000);
      candidate.onMessage.addListener(message=>{
        if(message.type==='ready'){ready=true;clearTimeout(timeout);finish(true);}
        if(message.type==='invalidated')wake();
      });
      candidate.onDisconnect.addListener(()=>{
        clearTimeout(timeout);finish(false);
        if(port===candidate){port=null;connection=null;remove();if(ready)wake();}
      });
    }catch{connection=null;finish(false);remove();}
    return promise;
  }
  const words=()=>data?.language==='zh-CN'?{
    subtitle:'从兴趣出发，多探索一点',hint:'来自已保存兴趣 · 在新标签页打开',open:'打开 OtherWise',close:'在此标签页中隐藏推荐',failure:'暂时无法打开，请稍后重试。',region:'OtherWise 主动推荐',explore:'探索',
  }:{subtitle:'A little wider',hint:'From your saved interests · Opens a new tab',open:'Open OtherWise',close:'Hide recommendations in this tab',failure:'Could not open this right now. Please try again.',region:'OtherWise recommendations',explore:'Explore'};
  function element(tag,text,className){const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;}
  async function act(button,message){
    if(!button.isConnected || button.disabled)return;
    button.disabled=true;
    try{const result=await send(message);if(result?.error || !result?.ok)throw new Error();}
    catch{const status=shadow?.querySelector('[role=status]');if(status)status.textContent=words().failure;}
    finally{button.disabled=false;}
  }
  function mount(target){
    if(!data?.cards?.length || closed)return;
    remove();
    const text=words();host=document.createElement('div');host.id='otherwise-proactive';
    host.style.cssText=`all:initial;display:block;box-sizing:border-box;max-width:1100px;min-width:0;position:relative;isolation:isolate;${provider()==='google'?'margin:12px clamp(16px,8vw,120px);':'margin:12px 0 20px;width:100%;'}`;
    shadow=host.attachShadow({mode:'closed'});
    const style=element('style');style.textContent=`
      :host{color-scheme:light dark}*{box-sizing:border-box}section{font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#173b35;background:#f3f8f6;border:1px solid #d3e3de;border-radius:16px;padding:16px;box-shadow:0 2px 8px #173b3506}
      header{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}.brand{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700;letter-spacing:-.2px}.mark{display:inline-grid;place-items:center;background:#1a6554;color:white;border-radius:8px;width:26px;height:26px;font-size:20px;font-weight:400}.subtitle{font-size:12px;color:#52746a}.tools{margin-left:auto;display:flex;gap:8px;align-items:center}button{font:inherit;color:inherit;cursor:pointer}button:disabled{opacity:.6;cursor:wait}button:focus-visible{outline:3px solid #298673;outline-offset:3px}.quiet{border:0;background:transparent;border-radius:7px;padding:6px;font-size:12px}.quiet:hover{background:#dcece6}.close{font-size:22px;line-height:1;width:30px;height:30px}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.card{display:flex;flex-direction:column;text-align:left;gap:5px;width:100%;background:#fff;border:1px solid #dde8e3;border-radius:11px;padding:12px 14px;min-width:0;transition:background .15s,border-color .15s}.card:hover{background:#eaf5ef;border-color:#83b7a5}.title{display:flex;justify-content:space-between;gap:12px;font-weight:650;font-size:15px;overflow-wrap:anywhere}.arrow{color:#568476}.description{font-size:12px;color:#547267;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}.hint{font-size:11px;color:#657d74;margin:10px 0 0}.status{font-size:12px;color:#9a4318;margin:4px 0 0}.status:empty{display:none}
      @media(max-width:650px){section{padding:12px}.cards{grid-template-columns:1fr;gap:7px}.card{padding:10px 12px}.subtitle{display:none}.tools{gap:0}.quiet{font-size:11px}}
      @media(prefers-color-scheme:dark){section{background:#162721;color:#ddf0e6;border-color:#355044}.subtitle,.hint,.description{color:#a4bfb0}.card{background:#20362b;border-color:#3c5749}.card:hover,.quiet:hover{background:#2c4739}.arrow{color:#9bcab3}.status{color:#f4be8a}}
      @media(prefers-reduced-motion:reduce){*{transition:none!important}}
    `;
    const section=element('section');section.setAttribute('aria-label',text.region);
    const header=element('header'),brand=element('div',null,'brand');
    brand.append(element('span','↗','mark'),element('span','OtherWise'));
    const tools=element('div',null,'tools'),open=element('button',text.open,'quiet'),close=element('button','×','quiet close');
    open.type=close.type='button';close.dataset.close='';close.title=text.close;close.setAttribute('aria-label',text.close);
    open.addEventListener('click',()=>act(open,{type:'PROACTIVE_OPEN_APP'}));
    close.addEventListener('click',()=>{closed=true;sequence++;remove();void send({type:'PROACTIVE_DISMISS'}).catch(()=>{});});
    tools.append(open,close);header.append(brand,element('span',text.subtitle,'subtitle'),tools);
    const cards=element('div',null,'cards');
    for(const card of data.cards.slice(0,3)){
      if(typeof card.topic!=='string' || typeof card.description!=='string')continue;
      const button=element('button',null,'card');button.type='button';button.dataset.card=card.cardId;
      button.setAttribute('aria-label',`${text.explore} ${card.topic}`);
      const title=element('span',null,'title');title.append(element('span',card.topic),element('span','↗','arrow'));
      button.append(title,element('span',card.description,'description'));
      const batchId=data.batchId;
      button.addEventListener('click',()=>act(button,{type:'PROACTIVE_OPEN',batchId,cardId:card.cardId}));cards.append(button);
    }
    const status=element('p',null,'status');status.setAttribute('role','status');
    section.append(header,cards,element('p',text.hint,'hint'),status);shadow.append(style,section);
    if(target.placement==='after')target.node.after(host);else target.node.prepend(host);
  }
  async function check(){
    timer=null;
    if(closed || navigating || !provider()){sequence++;remove();data=null;triedRoute=null;return;}
    if(document.visibilityState==='hidden')return;
    const target=anchor();
    if(!target){remove();return;}
    const current=route();
    if(current!==triedRoute){
      sequence++;remove();data=null;
      if(pending)return;
      triedRoute=current;pending=true;const version=sequence;
      try{
        if(!await connect())return;
        if(version!==sequence || current!==route() || closed)return;
        const result=await send({type:'PROACTIVE_GET'});
        if(version!==sequence || current!==route() || closed)return;
        if(result?.enabled && result.cards?.length){data=result;const currentTarget=anchor();if(currentTarget)mount(currentTarget);}
      }catch{remove();}
      finally{pending=false;if(version!==sequence || current!==route())schedule();}
      return;
    }
    if(data && (!host?.isConnected || (target.placement==='prepend'?host.parentElement!==target.node:host.previousElementSibling!==target.node)))mount(target);
  }
  function schedule(){if(timer===null)timer=setTimeout(check,120);}
  function wake(){sequence++;data=null;triedRoute=null;remove();schedule();}
  const observer=new MutationObserver(schedule);observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('yt-navigate-start',()=>{navigating=true;sequence++;remove();});
  document.addEventListener('yt-navigate-finish',()=>{navigating=false;wake();});
  window.addEventListener('popstate',wake);
  document.addEventListener('visibilitychange',schedule);
  globalThis.__otherwiseProactive={wake};schedule();
})();
