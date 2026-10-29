// Original DOS cursor rectangles and hotspots from loadMouseShapes / updateMousePointer.
import {readGameResources, decodeCps} from './indexed_resources.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const resources=await readGameResources(process.argv[2],['MOUSE.CPS','PALETTE.COL']);
const image=decodeCps(resources.get('MOUSE.CPS'),resources.get('PALETTE.COL'));
await mkdir('public/assets/cursors',{recursive:true});
for(const [name,x,y,w,h] of [['pointer',0,0,8,10],['north',80,18,16,9],['east',96,18,16,11],['south',112,18,16,9],['west',128,18,16,11]]){
  const colors=new Map();
  for(let row=0;row<h;row++)for(let col=0;col<w;col++){
    const index=image.pixels[(y+row)*image.width+x+col];if(!index)continue;
    colors.set(index,(colors.get(index)??'')+`M${col} ${row}h1v1h-1z`);
  }
  const paths=[...colors].map(([i,d])=>`<path fill="rgb(${image.palette.slice(i*3,i*3+3).join(',')})" d="${d}"/>`).join('');
  await writeFile(`public/assets/cursors/${name}.svg`,`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${paths}</svg>`);
}
