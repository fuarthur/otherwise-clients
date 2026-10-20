// Copied only into a disposable test extension; never included in the product.
import {createGalaxyMap} from './ui/galaxy.js';
import {prepareGalaxy,screenToWorld,worldToScreen} from './ui/galaxy-logic.js';

const [catalog,layout]=await Promise.all(['catalog.json','galaxy-layout.json'].map(path=>fetch(path).then(response=>response.json())));
const data=prepareGalaxy(catalog,layout),mutations=[];
const state={salt:'fictional-tour-test',approved:catalog.filter(topic=>['Photography','Education'].includes(topic.id)),
  baseline:[],recommendations:[],explored:[],edges:[],settings:{galaxyExplorationMode:true}};
const paint={labels:[],drawMs:[],started:0};
const proto=CanvasRenderingContext2D.prototype;
for(const name of ['clearRect','fillText']) {
  const original=proto[name];
  proto[name]=function(...args) {
    if(this.canvas.classList.contains('galaxy-canvas')) {
      if(name==='clearRect'){paint.started=performance.now();paint.labels=[];}
      else {
        const transform=this.getTransform(),width=this.measureText(args[0]).width;
        paint.labels.push({text:args[0],x:args[1],y:args[2],width,b:transform.b,c:transform.c});
        paint.drawMs.push(performance.now()-paint.started);
      }
    }
    return original.apply(this,args);
  };
}
const map=createGalaxyMap({container:document.querySelector('#map'),catalog,layout,state,
  viewState:{query:'photo',domain:data.byId.get('Photography').domain,selected:'Photography',camera:{...data.byId.get('Photography'),zoom:1}},
  onSave:()=>mutations.push('save'),onFocus:()=>mutations.push('focus'),onEnterFocus:()=>mutations.push('enter-focus'),onSearch:()=>mutations.push('search'),
  requestGalaxyLayout:async parameters=>({job_id:'fictional-preview',status:'ready',result:{
    schema_version:1,cache_key:'tour-shifted-layout',catalog_sha256:layout.metadata.catalog_sha256,
    model:layout.metadata.model,embedding:layout.metadata.embedding,parameters,
    topics:layout.topics.map(point=>({id:point.id,x:point.x+5,y:point.y+3})),
    domains:layout.domains.map(point=>({...point,x:point.x+5,y:point.y+3})),
  }}),pollGalaxyLayout:async()=>{throw new Error('An immediately ready preview must not poll.');},
});
const canvas=document.querySelector('.galaxy-canvas');
const viewport=()=>{const rect=canvas.getBoundingClientRect();return {width:rect.width,height:rect.height};};
const camera=()=>({x:Number(canvas.dataset.centerX),y:Number(canvas.dataset.centerY),zoom:Number(canvas.dataset.zoom),angle:Number(canvas.dataset.angle)});
window.tourTest={map,tour:map.getTourController(),catalog,data,state,paint,mutations,camera,viewport,
  world:point=>screenToWorld(point,camera(),viewport(),data.bounds),
  screen:point=>worldToScreen(point,camera(),viewport(),data.bounds),
  point:id=>data.byId.get(id),
};
canvas.addEventListener('wheel',event=>{
  const rect=canvas.getBoundingClientRect(),point={x:event.clientX-rect.left,y:event.clientY-rect.top};
  tourTest.wheelAnchor={point,world:tourTest.world(point)};
},{capture:true});
