import { startRoom } from '../../src/engine/gameplay/game';
import { gemCutScene } from '../../src/engine/scenes/gemCut';
import { loadForestData, createForestState, traceForest, applyForestState } from '../../src/engine/gameplay/forest';
import { loadScenePack, IndexedClip } from '../../src/engine/resources/scenePack';
import type { RoomAction } from '../../src/engine/gameplay/roomScript';
const canvas=document.querySelector('canvas')!,ctx=canvas.getContext('2d')!,result=document.querySelector('#result')!;
const merith=new URLSearchParams(location.search).has('merith'),name=merith?'FORESTB':'BROKEN';
const data=await loadForestData('/kyraweb/assets/forest/forest.json.gz'),room=data.rooms[name];
const pack=await loadScenePack(`/kyraweb/assets/forest/${name.toLowerCase()}.kyr.gz`);
const quest=createForestState();
if(merith){quest.flags.add(65);quest.flags.add(83);}
if(merith)document.querySelector('button')!.textContent='Verify Merith frames';
let now=performance.now(),next:FrameRequestCallback[]=[],active=false,npc:Extract<RoomAction,{op:'npc'}>|undefined;
window.requestAnimationFrame=cb=>{next.push(cb);return next.length;};
const snap={pos:{x:280,y:110},facing:5,inventorySlots:[],itemInHand:null,sceneItems:[],overlays:[],treeSpoken:true};
const setup=traceForest(room,0,quest,snap).actions;
setup.forEach(a=>applyForestState(quest,a));
const entry=traceForest(room,3,quest,snap).actions;
let walkingFrames=0,draws:HTMLCanvasElement[]=[];
const draw=ctx.drawImage.bind(ctx);
ctx.drawImage=(...args:any[])=>{if(args[0] instanceof HTMLCanvasElement)draws.push(args[0]);draw(...args as Parameters<typeof draw>);};
const game=await startRoom(canvas,{scene:{...gemCutScene,opening:undefined,overlays:[],items:[],meta:room,emc:{sceneAnimShapes:[]},sceneMetaSrc:undefined,sceneEmcSrc:undefined,maskSrc:undefined,indexedBackground:{src:`/kyraweb/assets/forest/${name.toLowerCase()}.kyr.gz`,clip:'room'},maskClip:'mask'},backgroundPack:pack,setupActions:setup,entryActions:entry,entry:{...snap.pos,facing:5},playOpening:false,npcFrames:room.npcFrames,onSequenceChange:v=>active=v,onScriptAction:a=>{applyForestState(quest,a);if(a.op==='npc')npc=a;}});
const still=new IndexedClip(pack,pack.clips[merith?'tag':'needsaw1']);
function rgba(index:number){const pixels=still.frame(index);return Array.from(pixels,p=>still.info.palette[p*3]+','+still.info.palette[p*3+1]+','+still.info.palette[p*3+2]).join(';');}
const standing=rgba(0),talking=rgba(merith?0:30);
function capture(label:string){const figure=document.createElement('figure'),image=new Image(),caption=document.createElement('figcaption');image.src=canvas.toDataURL();caption.textContent=label;figure.append(image,caption);document.querySelector('#gallery')!.append(figure);}
function step(){now+=50;draws=[];const batch=next;next=[];batch.forEach(cb=>cb(now));
 if(npc?.visible&&npc.shape>=78&&npc.shape<=84&&npc.x>224){
  walkingFrames++;
  for(const image of draws.filter(i=>i.width===40&&i.height===48)){
   const bytes=image.getContext('2d')!.getImageData(0,0,40,48).data;
   let key='';for(let i=0;i<bytes.length;i+=4)key+=(i?';':'')+bytes[i]+','+bytes[i+1]+','+bytes[i+2];
   if(key===standing||key===talking)throw Error('Stale Herman WSA remains beside walking actor');
  }
  if(walkingFrames===3||walkingFrames===12)capture('Herman walking '+walkingFrames);
 }
}
document.querySelector('button')!.onclick=()=>{try{
 for(let i=0;i<2400&&active;i++){step();if([0,30,80,160,220,280].includes(i))capture('First conversation '+i);
  if(merith&&[0,30,80,160].includes(i)){
   const bg=new IndexedClip(pack,pack.clips.room),pixels=bg.frame(0),actual=ctx.getImageData(104,64,32,48).data;
   let changed=0;for(let y=0;y<48;y++)for(let x=0;x<32;x++){const p=pixels[(y+64)*320+x+104]*3,k=(y*32+x)*4;if(actual[k]!==bg.info.palette[p]||actual[k+1]!==bg.info.palette[p+1]||actual[k+2]!==bg.info.palette[p+2])changed++;}
   if(changed<20)throw Error('Merith disappeared during dialogue or approach at frame '+i);
  }
 }
 if(merith){if(active||!game.getSnapshot().sceneItems.some(i=>i.id==='marble'))throw Error('Merith sequence incomplete');result.textContent='PASS — Merith entrance, jump and marble';document.title='PASS — Merith frames';return;}
 capture('Herman idle');
 const actions=traceForest(room,1,quest,{...game.getSnapshot(),itemInHand:'saw'},{x:220,y:80}).actions;
 game.runSequence(actions);
 for(let i=0;i<4000&&active;i++)step();
 if(active||!walkingFrames)throw Error('Scenario incomplete');
 capture('Herman left');result.textContent=`PASS — ${walkingFrames} walking frames without stale WSA duplicates`;document.title='PASS — NPC frames';
 }catch(e){result.textContent=String(e);document.title='FAIL — NPC frames';}};
